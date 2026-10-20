import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { isCheckViolation, isForeignKeyViolation, isNotFound, isRlsViolation, isUniqueViolation } from '@fixflow/db';
import type { ErrorCode, ProblemDetails } from '@fixflow/shared';
import { AppError } from './errors.js';

const TITLES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  413: 'Payload too large',
  415: 'Unsupported media type',
  422: 'Unprocessable content',
  429: 'Too many requests',
  500: 'Internal server error',
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

/** Renders every error as RFC 9457 problem+json; never leaks stack traces or SQL. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') throw exception;
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();
    const problem = this.toProblem(exception);
    problem.requestId = String(req.id ?? '');

    if (problem.status >= 500) {
      this.logger.error({ err: exception, requestId: problem.requestId }, 'Unhandled error');
    }
    if (res.headersSent) return;
    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(e: unknown): ProblemDetails {
    if (e instanceof AppError) {
      return this.base(e.getStatus(), e.code, e.message, e.extra);
    }
    if (e instanceof ThrottlerException) {
      return this.base(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const message =
        typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? e.message);
      return this.base(status, CODE_BY_STATUS[status] ?? 'INTERNAL', Array.isArray(message) ? message.join('; ') : message);
    }
    // Multer / body-parser errors
    const anyErr = e as { code?: string; type?: string; status?: number; message?: string };
    if (anyErr?.code === 'LIMIT_FILE_SIZE' || anyErr?.type === 'entity.too.large') {
      return this.base(413, 'PAYLOAD_TOO_LARGE', 'The upload or request body is too large.');
    }
    if (anyErr?.type === 'entity.parse.failed') {
      return this.base(400, 'VALIDATION_FAILED', 'Malformed JSON body.');
    }
    // Database invariants that surfaced past service-level checks.
    if (isUniqueViolation(e)) return this.base(409, 'CONFLICT', 'A record with these details already exists.');
    if (isNotFound(e)) return this.base(404, 'NOT_FOUND', 'Resource not found');
    if (isForeignKeyViolation(e) || isRlsViolation(e)) {
      // Composite tenant FKs / RLS rejected a reference: report as not found, disclose nothing.
      return this.base(404, 'NOT_FOUND', 'A referenced record was not found');
    }
    if (isCheckViolation(e)) return this.base(422, 'VALIDATION_FAILED', 'The change violates a business rule.');
    return this.base(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL', 'Something went wrong on our side.');
  }

  private base(
    status: number,
    code: ErrorCode,
    detail: string,
    extra: Partial<ProblemDetails> = {},
  ): ProblemDetails {
    return {
      type: `https://fixflow.dev/problems/${code.toLowerCase().replace(/_/g, '-')}`,
      title: TITLES[status] ?? 'Error',
      status,
      code,
      detail,
      ...extra,
    };
  }
}
