export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string, id?: string) =>
  new AppError(404, 'NOT_FOUND', id ? `${what} ${id} not found` : `${what} not found`);

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', message, details);

export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);

export const unauthorized = (message = 'Missing or invalid API key') =>
  new AppError(401, 'UNAUTHORIZED', message);
