import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode, ProblemDetails } from '@fixflow/shared';

/**
 * Application error carrying a stable `code`. The global filter renders it as
 * RFC 9457 problem+json. Cross-tenant lookups deliberately use `notFound` (404),
 * never 403, so the existence of other organizations' records is not disclosed.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly extra: Partial<Pick<ProblemDetails, 'errors' | 'currentVersion' | 'reasons'>> = {},
  ) {
    super(message, status);
  }
}

export const notFound = (what = 'Resource') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);

export const forbidden = (message = 'You do not have permission to perform this action') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);

export const conflict = (message: string) => new AppError(HttpStatus.CONFLICT, 'CONFLICT', message);

export const versionConflict = (currentVersion: number) =>
  new AppError(
    HttpStatus.CONFLICT,
    'VERSION_CONFLICT',
    'This work order was changed by someone else. Review the latest version and try again.',
    { currentVersion },
  );

export const badRequest = (message: string, code: ErrorCode = 'VALIDATION_FAILED') =>
  new AppError(HttpStatus.BAD_REQUEST, code, message);

export const unprocessable = (code: ErrorCode, message: string, reasons?: string[]) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, { reasons });

export const unauthenticated = (message = 'Sign in to continue', code: ErrorCode = 'UNAUTHENTICATED') =>
  new AppError(HttpStatus.UNAUTHORIZED, code, message);
