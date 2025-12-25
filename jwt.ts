import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const REFRESH_SECRET = process.env.REFRESH_SECRET || randomBytes(32).toString('hex');

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// Генерация токенов
export function generateTokens(payload: TokenPayload): Tokens {
  const accessToken = jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: '15m' } // Короткоживущий токен
  );

  const refreshToken = jwt.sign(
    { userId: payload.userId },
    REFRESH_SECRET,
    { expiresIn: '7d' } // Долгоживущий токен
  );

  return { accessToken, refreshToken };
}

// Валидация access токена
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch (error) {
    return null;
  }
}

// Валидация refresh токена
export function verifyRefreshToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as { userId: string };
  } catch (error) {
    return null;
  }
}

// Обновление токенов
export function refreshTokens(refreshToken: string): Tokens | null {
  const payload = verifyRefreshToken(refreshToken);

  if (!payload) {
    return null;
  }

  // Здесь можно получить пользователя из базы данных
  // и сгенерировать новые токены

  return generateTokens({
    userId: payload.userId,
    email: '', // Получить из БД
    username: '' // Получить из БД
  });
}