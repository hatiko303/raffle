import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import { Server as SocketIOServer, Socket } from 'socket.io'
import {
  registerUser,
  loginUser,
  findUserById,
  createSession,
  deleteSession,
  findSessionByToken
} from './auth/database'
import { generateTokens, verifyAccessToken, TokenPayload } from './auth/jwt'
import { createRaffle, raffles, stopRaffle, getParticipants } from './raffle'
import { startBot, stopBot } from './bot'

export const app: FastifyInstance = Fastify({
  logger: {
    level: 'info'
  }
})

// ===== КОНФИГУРАЦИЯ =====

// Cookie plugin
app.register(cookie, {
  secret: process.env.COOKIE_SECRET || 'your-cookie-secret-key-123',
  hook: 'onRequest'
})

// CORS
app.register(cors, {
  origin: ['http://localhost:8000', 'http://127.0.0.1:8000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
})

// ===== SOCKET.IO =====

const server = app.server
export const io = new SocketIOServer(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST']
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
})

// Middleware для проверки аутентификации в Socket.IO
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.replace('Bearer ', '')

    // ⚠️ ВРЕМЕННО: разрешаем подключение без токена для разработки
    if (!token) {
      console.log(`⚠️ WebSocket connected WITHOUT token: ${socket.id}`)
      socket.data.username = 'guest'
      return next()
    }

    const payload = verifyAccessToken(token)

    if (!payload) {
      return next(new Error('Invalid token'))
    }

    // Добавляем данные пользователя в сокет
    socket.data.userId = payload.userId
    socket.data.username = payload.username

    next()
  } catch (error) {
    console.log('Socket.IO auth error:', error)
    socket.data.username = 'error-guest'
    next()
  }
})

io.on('connection', (socket: Socket) => {
  console.log(`⚡ WebSocket client connected: ${socket.id} (User: ${socket.data.username || 'unknown'})`)

  socket.on('joinRaffle', (raffleId: string) => {
    socket.join(`raffle:${raffleId}`)
    socket.data.raffleId = raffleId
    console.log(`Client ${socket.id} joined raffle ${raffleId}`)

    const participants = getParticipants(raffleId)
    socket.emit('participantsUpdate', {
      participants,
      count: participants.length
    })
  })

  socket.on('disconnect', (reason: string) => {
    console.log(`WebSocket client disconnected: ${socket.id}, reason: ${reason}`)
  })
})

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error occurred'
}

// Middleware для проверки аутентификации
async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    console.log('🔐 Authenticate called for:', request.url)

    // Получаем токен из cookies
    let token = request.cookies['accessToken']

    // Если нет в cookies, проверяем заголовок Authorization
    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization as string
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7)
      }
    }

    // ⚠️ ВРЕМЕННО: если нет токена, пропускаем проверку для разработки
    if (!token) {
      console.log('⚠️ No token found, allowing access for development')
        // Создаем тестового пользователя
        ; (request as any).user = {
          id: 'test-user-id',
          email: 'test@example.com',
          username: 'testuser'
        }
      return
    }

    // Проверяем токен
    const payload = verifyAccessToken(token)

    if (!payload) {
      return reply.status(401).send({
        ok: false,
        error: 'Неверный или просроченный токен'
      })
    }

    // Проверяем сессию в базе данных
    const session = findSessionByToken(token)

    if (!session) {
      return reply.status(401).send({
        ok: false,
        error: 'Сессия не найдена'
      })
    }

    // Добавляем пользователя в объект запроса
    ; (request as any).user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username
    }

  } catch (error) {
    console.error('Authentication error:', error)
      // ⚠️ ВРЕМЕННО: разрешаем доступ при ошибке для разработки
      ; (request as any).user = {
        id: 'error-user-id',
        email: 'error@example.com',
        username: 'erroruser'
      }
  }
}

// Установка auth cookies
function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string): void {
  reply.setCookie('accessToken', accessToken, {
    httpOnly: true,
    secure: false, // false для локальной разработки
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 // 15 минут
  })

  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: false, // false для локальной разработки
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 // 7 дней
  })
}

// Очистка auth cookies
function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('accessToken')
  reply.clearCookie('refreshToken')
}

// ===== АУТЕНТИФИКАЦИЯ =====

// Регистрация
app.post('/auth/register', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'username', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        username: { type: 'string', minLength: 3, maxLength: 20 },
        password: { type: 'string', minLength: 6 }
      }
    }
  }
}, async (request: FastifyRequest<{
  Body: { email: string; username: string; password: string }
}>, reply: FastifyReply) => {
  try {
    const { email, username, password } = request.body

    // Регистрируем пользователя
    const user = await registerUser(email, username, password)

    // Генерируем токены
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username
    })

    // Создаем сессию
    createSession(user.id, tokens.accessToken)

    // Устанавливаем cookies
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken)

    return {
      ok: true,
      message: 'Регистрация успешна',
      token: tokens.accessToken, // ⭐ Возвращаем токен в ответе
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt
      }
    }
  } catch (error) {
    console.error('Registration error:', error)
    return reply.status(400).send({
      ok: false,
      error: getErrorMessage(error)
    })
  }
})

// Вход
app.post('/auth/login', {
  schema: {
    body: {
      type: 'object',
      required: ['emailOrUsername', 'password'],
      properties: {
        emailOrUsername: { type: 'string' },
        password: { type: 'string' }
      }
    }
  }
}, async (request: FastifyRequest<{
  Body: { emailOrUsername: string; password: string }
}>, reply: FastifyReply) => {
  try {
    const { emailOrUsername, password } = request.body

    // Авторизуем пользователя
    const user = await loginUser(emailOrUsername, password)

    // Генерируем токены
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username
    })

    // Создаем сессию
    createSession(user.id, tokens.accessToken)

    // Устанавливаем cookies
    setAuthCookies(reply, tokens.accessToken, tokens.refreshToken)

    return {
      ok: true,
      message: 'Вход выполнен успешно',
      token: tokens.accessToken, // ⭐ Возвращаем токен в ответе
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        lastLogin: user.lastLogin
      }
    }
  } catch (error) {
    console.error('Login error:', error)
    return reply.status(401).send({
      ok: false,
      error: getErrorMessage(error)
    })
  }
})

// Выход
app.post('/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const token = request.cookies['accessToken']

    if (token) {
      deleteSession(token)
    }

    // Очищаем cookies
    clearAuthCookies(reply)

    return {
      ok: true,
      message: 'Выход выполнен успешно'
    }
  } catch (error) {
    console.error('Logout error:', error)
    return reply.status(500).send({
      ok: false,
      error: 'Ошибка при выходе'
    })
  }
})

// Получение профиля
app.get('/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply)

  // Если authenticate вернул ошибку, пользователь не аутентифицирован
  if (reply.statusCode === 401) return

  try {
    const user = (request as any).user
    const userData = findUserById(user.id)

    if (!userData) {
      return reply.status(404).send({
        ok: false,
        error: 'Пользователь не найден'
      })
    }

    return {
      ok: true,
      user: {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin
      }
    }
  } catch (error) {
    console.error('Profile error:', error)
    return reply.status(500).send({
      ok: false,
      error: 'Ошибка получения профиля'
    })
  }
})

// ===== НОВЫЕ ENDPOINTS ДЛЯ ФРОНТЕНДА =====

// Получение всех розыгрышей (для вкладки "Активные розыгрыши")
app.get('/raffles', async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  try {
    const user = (request as any).user

    // Возвращаем все розыгрыши пользователя
    const userRaffles = Array.from(raffles.entries())
      .filter(([_, raffle]) => (raffle as any).ownerId === user.id)
      .map(([id, raffle]) => ({
        id: raffle.id,
        title: raffle.title,
        description: raffle.description,
        streamLink: raffle.streamLink,
        codeWord: raffle.codeWord,
        type: raffle.description?.includes('чат') ? 'chat' : 'simple', // Определяем тип по описанию
        platform: raffle.streamLink?.includes('twitch') ? 'twitch' :
          raffle.streamLink?.includes('youtube') ? 'youtube' : 'unknown',
        participantCount: raffle.participants.size,
        active: raffle.active,
        createdAt: raffle.createdAt,
        owner: user.username
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return {
      ok: true,
      raffles: userRaffles
    }
  } catch (error) {
    console.error('Error getting raffles:', error)
    return reply.status(500).send({
      ok: false,
      error: 'Ошибка получения розыгрышей'
    })
  }
})

// Участие в розыгрыше
app.post('/raffle/:id/join', async (request: FastifyRequest<{
  Params: { id: string }
}>, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const { id } = request.params
  const user = (request as any).user

  try {
    const raffle = raffles.get(id)
    if (!raffle) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден'
      })
    }

    if (!raffle.active) {
      return reply.status(400).send({
        ok: false,
        error: 'Розыгрыш уже завершен'
      })
    }

    // Добавляем участника
    raffle.participants.add(user.username)

    // Отправляем уведомление через WebSocket
    io.to(`raffle:${id}`).emit('participantJoined', {
      raffleId: id,
      user: user.username,
      count: raffle.participants.size
    })

    return {
      ok: true,
      message: 'Вы успешно присоединились к розыгрышу',
      participantCount: raffle.participants.size
    }
  } catch (error) {
    console.error(`Error joining raffle ${id}:`, error)
    return reply.status(500).send({
      ok: false,
      error: `Ошибка при присоединении к розыгрышу: ${getErrorMessage(error)}`
    })
  }
})

// ===== ОБНОВЛЕННЫЕ МАРШРУТЫ РОЗЫГРЫШЕЙ =====

// Создание розыгрыша с поддержкой типов
app.post('/raffle/create', async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  try {
    const body = request.body as any
    const { streamLink, codeWord, title, description, type, platform } = body
    const user = (request as any).user

    // Валидация в зависимости от типа
    if (type === 'chat') {
      if (!streamLink || !codeWord) {
        return reply.status(400).send({
          ok: false,
          error: 'Для розыгрыша в чате укажите ссылку на стрим и кодовое слово'
        })
      }

      // Проверяем URL
      try {
        new URL(streamLink)
      } catch {
        return reply.status(400).send({
          ok: false,
          error: 'Некорректная ссылка на стрим'
        })
      }
    }

    // Создаем розыгрыш
    const raffle = createRaffle(
      streamLink || '',
      codeWord || '',
      title || 'Без названия',
      description || (type === 'chat' ? 'Розыгрыш в чате' : 'Обычный розыгрыш'),
      user.id
    )

      // Добавляем дополнительные данные
      ; (raffle as any).type = type || 'simple'
      ; (raffle as any).platform = platform || 'unknown'
      ; (raffle as any).owner = user.username

    io.emit('raffleCreated', {
      id: raffle.id,
      streamLink,
      codeWord,
      title,
      description,
      type,
      platform,
      createdAt: new Date().toISOString(),
      participantCount: 0,
      owner: user.username
    })

    console.log(`🎉 Розыгрыш создан пользователем ${user.username}: ${raffle.id}`)

    return {
      ok: true,
      id: raffle.id,
      message: 'Розыгрыш успешно создан',
      raffle: {
        id: raffle.id,
        title: raffle.title,
        description: raffle.description,
        streamLink: raffle.streamLink,
        codeWord: raffle.codeWord,
        type,
        platform,
        active: raffle.active,
        createdAt: raffle.createdAt,
        owner: user.username
      }
    }
  } catch (error: unknown) {
    console.error('Error creating raffle:', getErrorMessage(error))
    return reply.status(500).send({
      ok: false,
      error: 'Внутренняя ошибка сервера'
    })
  }
})

// Старт бота для розыгрыша
app.post('/raffle/:id/start', async (request: FastifyRequest<{
  Params: { id: string }
}>, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const { id } = request.params
  const user = (request as any).user

  try {
    const raffle = raffles.get(id)

    // Проверяем права доступа
    if (!raffle || (raffle as any).ownerId !== user.id) {
      return reply.status(403).send({
        ok: false,
        error: 'Доступ запрещен'
      })
    }

    if (!raffle.active) {
      return reply.status(400).send({
        ok: false,
        error: 'Розыгрыш уже остановлен'
      })
    }

    await startBot(id)

    io.to(`raffle:${id}`).emit('raffleStarted', {
      raffleId: id,
      startedAt: new Date().toISOString()
    })

    console.log(`🚀 Бот запущен пользователем ${user.username} для розыгрыша: ${id}`)

    return {
      ok: true,
      message: 'Бот успешно запущен',
      raffleId: id
    }
  } catch (error: unknown) {
    console.error(`Error starting bot for raffle ${id}:`, getErrorMessage(error))
    return reply.status(500).send({
      ok: false,
      error: `Ошибка при запуске бота: ${getErrorMessage(error)}`
    })
  }
})

// Остановка розыгрыша
app.post('/raffle/:id/stop', async (request: FastifyRequest<{
  Params: { id: string }
}>, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const { id } = request.params
  const user = (request as any).user

  try {
    const raffle = raffles.get(id)

    if (!raffle) {
      return reply.status(404).send({
        ok: false,
        error: 'Розыгрыш не найден'
      })
    }

    if ((raffle as any).ownerId !== user.id) {
      return reply.status(403).send({
        ok: false,
        error: 'Доступ запрещен'
      })
    }

    // Останавливаем розыгрыш и бота
    stopRaffle(id)
    await stopBot(id)

    io.to(`raffle:${id}`).emit('raffleStopped', {
      raffleId: id,
      stoppedAt: new Date().toISOString(),
      winnerCount: raffle.participants.size
    })

    console.log(`🛑 Розыгрыш остановлен пользователем ${user.username}: ${id}`)

    return {
      ok: true,
      message: 'Розыгрыш остановлен',
      raffleId: id,
      totalParticipants: raffle.participants.size
    }
  } catch (error: unknown) {
    console.error(`Error stopping raffle ${id}:`, getErrorMessage(error))
    return reply.status(500).send({
      ok: false,
      error: `Ошибка при остановке розыгрыша: ${getErrorMessage(error)}`
    })
  }
})

// Получение информации о розыгрыше (для поиска)
app.get('/raffle/:id', async (request: FastifyRequest<{
  Params: { id: string }
}>, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const { id } = request.params
  const user = (request as any).user

  const raffle = raffles.get(id)

  if (!raffle) {
    return reply.status(404).send({
      ok: false,
      error: 'Розыгрыш не найден'
    })
  }

  // Разрешаем просмотр любому авторизованному пользователю
  // if ((raffle as any).ownerId !== user.id) {
  //   return reply.status(403).send({
  //     ok: false,
  //     error: 'Доступ запрещен'
  //   })
  // }

  return {
    ok: true,
    raffle: {
      id: raffle.id,
      streamLink: raffle.streamLink,
      codeWord: raffle.codeWord,
      title: raffle.title,
      description: raffle.description,
      type: (raffle as any).type || 'simple',
      platform: (raffle as any).platform || 'unknown',
      active: raffle.active,
      participants: Array.from(raffle.participants),
      participantCount: raffle.participants.size,
      createdAt: raffle.createdAt,
      owner: (raffle as any).owner || 'Неизвестно'
    }
  }
})

// Получение списка участников
app.get('/raffle/:id/participants', async (request: FastifyRequest<{
  Params: { id: string }
}>, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const { id } = request.params
  const user = (request as any).user

  const raffle = raffles.get(id)

  if (!raffle) {
    return reply.status(404).send({
      ok: false,
      error: 'Розыгрыш не найден'
    })
  }

  // Разрешаем просмотр любому авторизованному пользователю
  // if ((raffle as any).ownerId !== user.id) {
  //   return reply.status(403).send({
  //     ok: false,
  //     error: 'Доступ запрещен'
  //   })
  // }

  return {
    ok: true,
    participants: Array.from(raffle.participants),
    count: raffle.participants.size
  }
})

// Получение всех розыгрышей пользователя (старый endpoint для совместимости)
app.get('/raffles/my', async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  const user = (request as any).user

  const userRaffles = Array.from(raffles.entries())
    .filter(([_, raffle]) => (raffle as any).ownerId === user.id)
    .map(([id, raffle]) => ({
      id: raffle.id,
      streamLink: raffle.streamLink,
      codeWord: raffle.codeWord,
      title: raffle.title,
      description: raffle.description,
      participants: Array.from(raffle.participants),
      participantCount: raffle.participants.size,
      active: raffle.active,
      createdAt: raffle.createdAt
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return {
    ok: true,
    raffles: userRaffles,
    count: userRaffles.length
  }
})

// Получение всех розыгрышей (публичный, для вкладки "Активные розыгрыши")
app.get('/raffles', async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply)
  if (reply.statusCode === 401) return

  try {
    const user = (request as any).user

    // Возвращаем ВСЕ активные розыгрыши (не только пользователя)
    const allRaffles = Array.from(raffles.entries())
      .filter(([_, raffle]) => raffle.active) // Только активные
      .map(([id, raffle]) => ({
        id: raffle.id,
        title: raffle.title || 'Без названия',
        description: raffle.description || '',
        streamLink: raffle.streamLink,
        codeWord: raffle.codeWord,
        type: raffle.description?.includes('чат') ? 'chat' : 'simple',
        platform: raffle.streamLink?.includes('twitch') ? 'twitch' :
          raffle.streamLink?.includes('youtube') ? 'youtube' : 'unknown',
        participantCount: raffle.participants.size,
        active: raffle.active,
        createdAt: raffle.createdAt,
        owner: (raffle as any).owner || 'Неизвестно'
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return {
      ok: true,
      raffles: allRaffles
    }
  } catch (error) {
    console.error('Error getting all raffles:', error)
    return reply.status(500).send({
      ok: false,
      error: 'Ошибка получения розыгрышей'
    })
  }
})

// ===== ОБЩИЕ МАРШРУТЫ =====

// Тестовый маршрут
app.get('/', async () => ({
  status: 'ok',
  service: 'Raffle Bot API',
  version: '1.0.0',
  timestamp: new Date().toISOString()
}))

// Проверка здоровья
app.get('/health', async () => ({
  status: 'healthy',
  uptime: process.uptime(),
  timestamp: new Date().toISOString()
}))

// ===== ЗАПУСК СЕРВЕРА =====

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000')
    const host = process.env.HOST || '0.0.0.0'

    await app.listen({
      port,
      host
    })

    console.log(`🚀 Backend running on http://${host}:${port}`)
    console.log(`🔐 Authentication system ready`)
    console.log(`📡 WebSocket server ready`)

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM']
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n${signal} received, shutting down gracefully...`)

        for (const [id, raffle] of raffles.entries()) {
          if (raffle.active) {
            console.log(`Stopping raffle ${id}...`)
            stopRaffle(id)
            try {
              await stopBot(id)
            } catch (error) {
              console.error(`Error stopping bot for raffle ${id}:`, error)
            }
          }
        }

        io.close()
        await app.close()
        console.log('Server shutdown complete')
        process.exit(0)
      })
    })

  } catch (err: unknown) {
    console.error('Failed to start server:', getErrorMessage(err))
    process.exit(1)
  }
}

if (require.main === module) {
  start()
}

export default app