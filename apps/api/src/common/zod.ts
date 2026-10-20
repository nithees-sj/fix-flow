import { applyDecorators, Body, HttpStatus, type PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { AppError } from './errors.js';

/**
 * Validates and transforms input with a shared Zod schema from @fixflow/shared
 * (the same schema the web forms use), producing typed, normalized DTOs.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    throw new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Some fields are invalid.', {
      errors: result.error.issues.map((i) => ({
        path: i.path.map(String).join('.') || '(root)',
        message: i.message,
      })),
    });
  }
}

function jsonSchema(schema: z.ZodType, io: 'input' | 'output' = 'input'): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

/** `@ZBody(schema)` = validated body + OpenAPI request schema derived from Zod. */
export function ZBody<S extends z.ZodType>(schema: S): ParameterDecorator {
  const decorate = applyDecorators(ApiBody({ schema: jsonSchema(schema) }));
  return (target, key, index) => {
    if (key !== undefined) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) decorate(target, key, descriptor);
    }
    Body(new ZodValidationPipe(schema))(target, key, index);
  };
}

/** `@ZQuery(schema)` = validated query string + OpenAPI parameters. */
export function ZQuery<S extends z.ZodObject>(schema: S): ParameterDecorator {
  const shape = jsonSchema(schema) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
  const params = Object.entries(shape.properties ?? {}).map(([name, s]) =>
    ApiQuery({ name, required: shape.required?.includes(name) ?? false, schema: s }),
  );
  const decorate = applyDecorators(...params);
  return (target, key, index) => {
    if (key !== undefined) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (descriptor) decorate(target, key, descriptor);
    }
    Query(new ZodValidationPipe(schema))(target, key, index);
  };
}

/** Validates a route param as a UUID (returns 404 rather than 400, like a missing record). */
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!z.uuid().safeParse(value).success) {
      throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Resource not found');
    }
    return value;
  }
}
