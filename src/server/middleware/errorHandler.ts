import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  details?: any;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  const statusCode = err.statusCode || 500;
  
  // Log the error internally with context
  console.error(`[Error Handler] ${req.method} ${req.path} (${statusCode}):`, err.stack || err.message);

  // Avoid leaking raw internal error messages (e.g. MongoDB connection strings, internal query failures)
  const isProduction = process.env.NODE_ENV === 'production';
  const message = statusCode === 500 && isProduction
    ? 'An internal server error occurred'
    : err.message || 'An error occurred';

  res.status(statusCode).json({
    error: message,
    ...(err.details ? { details: err.details } : {})
  });
}

// Async wrapper to eliminate repetitive try/catch blocks in express routes
export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
