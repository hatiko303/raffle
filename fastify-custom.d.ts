import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    // Объединяем типы
    cookies: FastifyRequest['cookies'] & {
      accessToken?: string;
      refreshToken?: string;
    };
    user?: {
      id: string;
      email: string;
      username: string;
    };
  }
}

export { };