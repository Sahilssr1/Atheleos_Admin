export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class ConfigError extends Error {
  code = 'FIREBASE_NOT_CONFIGURED';
  status = 503;
  constructor(message = 'Firebase is not configured on the server') {
    super(message);
    this.name = 'ConfigError';
  }
}

export const notFound = (what = 'Resource') => new AppError('NOT_FOUND', `${what} not found`, 404);
export const forbidden = (msg = 'Insufficient permissions') => new AppError('FORBIDDEN', msg, 403);
export const unauthorized = (msg = 'Authentication required') => new AppError('UNAUTHORIZED', msg, 401);
