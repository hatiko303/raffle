import { hash, compare } from 'bcryptjs';

export interface User {
  id: string;
  email: string;
  username: string;
  password: string;
  createdAt: Date;
  lastLogin?: Date;
}

export interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

// In-memory база данных (в продакшене заменить на MongoDB/PostgreSQL)
export const users = new Map<string, User>();
export const sessions = new Map<string, Session>();

// Генерация ID
function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// Регистрация пользователя
export async function registerUser(
  email: string,
  username: string,
  password: string
): Promise<User> {
  // Проверка существующего пользователя
  const existingUser = Array.from(users.values()).find(
    user => user.email === email || user.username === username
  );

  if (existingUser) {
    throw new Error('Пользователь с таким email или именем уже существует');
  }

  // Хэширование пароля
  const hashedPassword = await hash(password, 10);

  const user: User = {
    id: generateId(),
    email,
    username,
    password: hashedPassword,
    createdAt: new Date()
  };

  users.set(user.id, user);
  return user;
}

// Авторизация пользователя
export async function loginUser(
  emailOrUsername: string,
  password: string
): Promise<User> {
  // Поиск пользователя по email или username
  const user = Array.from(users.values()).find(
    user => user.email === emailOrUsername || user.username === emailOrUsername
  );

  if (!user) {
    throw new Error('Неверный email/имя пользователя или пароль');
  }

  // Проверка пароля
  const isValidPassword = await compare(password, user.password);
  if (!isValidPassword) {
    throw new Error('Неверный email/имя пользователя или пароль');
  }

  // Обновляем время последнего входа
  user.lastLogin = new Date();
  users.set(user.id, user);

  return user;
}

// Поиск пользователя по ID
export function findUserById(id: string): User | undefined {
  return users.get(id);
}

// Поиск пользователя по email
export function findUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find(user => user.email === email);
}

// Создание сессии
export function createSession(userId: string, token: string): Session {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // Сессия на 7 дней

  const session: Session = {
    userId,
    token,
    expiresAt,
    createdAt: new Date()
  };

  sessions.set(token, session);
  return session;
}

// Получение сессии по токену
export function findSessionByToken(token: string): Session | undefined {
  const session = sessions.get(token);

  if (!session) {
    return undefined;
  }

  // Проверяем не истекла ли сессия
  if (session.expiresAt < new Date()) {
    sessions.delete(token);
    return undefined;
  }

  return session;
}

// Удаление сессии
export function deleteSession(token: string): void {
  sessions.delete(token);
}

// Получение всех сессий пользователя
export function getUserSessions(userId: string): Session[] {
  return Array.from(sessions.values())
    .filter(session => session.userId === userId);
}