import { describe, expect, it } from 'vitest';
import { createWorkOrderSchema } from '@fixflow/shared';
import { AppError } from '../../src/common/errors.js';
import { UuidParamPipe, ZodValidationPipe } from '../../src/common/zod.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(createWorkOrderSchema);

  it('rejects invalid bodies with field-level problem details', () => {
    try {
      pipe.transform({ title: 'x' });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.getStatus()).toBe(400);
      expect(err.code).toBe('VALIDATION_FAILED');
      const paths = (err.extra?.errors ?? []).map((i) => i.path);
      expect(paths).toContain('title');
    }
  });

  it('treats a missing body as an empty object rather than crashing', () => {
    expect(() => pipe.transform(undefined)).toThrow(AppError);
  });
});

describe('UuidParamPipe', () => {
  const pipe = new UuidParamPipe();
  it('passes UUIDs through', () => {
    const id = '0195f3c2-8d4a-7b1e-9c3f-2a6b8e4d1f07';
    expect(pipe.transform(id)).toBe(id);
  });
  it('answers 404 (not 400) for malformed ids so probing reveals nothing', () => {
    for (const bad of ['1', "1' OR '1'='1", '../etc/passwd', '']) {
      try {
        pipe.transform(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as AppError).getStatus()).toBe(404);
      }
    }
  });
});
