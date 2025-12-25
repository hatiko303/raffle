import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from './jwt';
import { findSessionByToken } from './database';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      username: string;
    };
  }
}

// Middleware для проверки аутентификации
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Получаем токен из cookies
    let token = request.cookies['accessToken'];

    // Если нет в cookies, проверяем заголовок Authorization
    if (!token && request.headers.authorization) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) {
      return reply.status(401).send({
        ok: false,
        error: 'Требуется аутентификация'
      });
    }

    // Проверяем токен
    const payload = verifyAccessToken(token);

    if (!payload) {
      // Проверяем refresh токен
      const refreshToken = request.cookies.refreshToken;

      if (!refreshToken) {
        clearAuthCookies(reply);
        return reply.status(401).send({
          ok: false,
          error: 'Сессия истекла. Требуется повторный вход'
        });
      }

      // Здесь можно добавить логику обновления токенов
      return reply.status(401).send({
        ok: false,
        error: 'Токен истек. Используйте refresh токен'
      });
    }

    // Проверяем сессию в базе данных
    const session = findSessionByToken(token);

    if (!session) {
      return reply.status(401).send({
        ok: false,
        error: 'Сессия не найдена'
      });
    }

    // Добавляем пользователя в запрос
    request.user = {
      id: payload.userId,
      email: payload.email,
      username: payload.username
    };

  } catch (error) {
    console.error('Authentication error:', error);
    return reply.status(401).send({
      ok: false,
      error: 'Ошибка аутентификации'
    });
  }
}

// Установка auth cookies
export function setAuthCookies(
  reply: FastifyReply,
  accessToken: string,
  refreshToken: string
): void {
  reply.setCookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 15 * 60 // 15 минут
  });

  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 // 7 дней
  });
}

// Очистка auth cookies
export function clearAuthCookies(reply: FastifyReply): void {
  reply.clearCookie('accessToken');
  reply.clearCookie('refreshToken');
}