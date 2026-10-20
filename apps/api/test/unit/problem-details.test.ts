import { type ArgumentsHost, ForbiddenException, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { describe, expect, it, vi } from 'vitest';
import type { ProblemDetails } from '@fixflow/shared';
import { versionConflict } from '../../src/common/errors.js';
import { ProblemDetailsFilter } from '../../src/common/problem-details.filter.js';

function render(e: unknown): { status: number; type: string; body: ProblemDetails } {
  const out = { status: 0, type: '', body: {} as ProblemDetails };
  const res = {
    headersSent: false,
    status(s: number) { out.status = s; return this; },
    type(t: string) { out.type = t; return this; },
    json(b: ProblemDetails) { out.body = b; return this; },
  };
  const host = {
    getType: () => 'http',
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ id: 'req-1' }) }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(e, host);
  return out;
}

const pgError = (code: string, message = 'db error') => Object.assign(new Error(message), { cause: { code } });

describe('ProblemDetailsFilter', () => {
  it('renders application errors as RFC 9457 problem+json with a request id', () => {
    const r = render(versionConflict(7));
    expect(r.status).toBe(409);
    expect(r.type).toBe('application/problem+json');
    expect(r.body).toMatchObject({ status: 409, code: 'VERSION_CONFLICT', requestId: 'req-1', currentVersion: 7 });
  });

  it('maps framework exceptions', () => {
    expect(render(new ForbiddenException()).body.code).toBe('FORBIDDEN');
    expect(render(new ThrottlerException()).status).toBe(429);
  });

  it('reports tenant FK and RLS rejections as a plain 404 without leaking SQL', () => {
    for (const e of [pgError('23503', 'insert violates foreign key "WorkOrder_org_asset_fkey"'), pgError('42501', 'new row violates row-level security policy')]) {
      const r = render(e);
      expect(r.status).toBe(404);
      expect(JSON.stringify(r.body)).not.toMatch(/fkey|row-level|policy/);
    }
  });

  it('maps unique and check violations', () => {
    expect(render(pgError('23505')).status).toBe(409);
    expect(render(pgError('23514')).status).toBe(422);
  });

  it('hides unknown errors behind a generic 500', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const r = render(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/ECONNREFUSED|secret/);
    expect(log).toHaveBeenCalledOnce(); // logged server-side with the request id
    log.mockRestore();
  });
});
