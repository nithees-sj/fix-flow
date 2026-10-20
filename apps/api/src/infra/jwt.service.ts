import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { ENV, type Env } from '../config/env.js';

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  org: string | null; // active organization (verified again on every request)
}

const ISSUER = 'fixflow';
const AUDIENCE = 'fixflow-api';

/** Short-lived HS256 access tokens. Revocation is handled via the session denylist in Redis. */
@Injectable()
export class JwtService {
  private readonly key: Uint8Array;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.key = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
  }

  async sign(claims: AccessClaims): Promise<string> {
    return new SignJWT({ sid: claims.sid, org: claims.org })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.key);
  }

  /** Returns null for any invalid/expired token (callers decide whether that is an error). */
  async verify(token: string): Promise<(AccessClaims & { exp: number }) | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return {
        sub: payload.sub,
        sid: payload.sid,
        org: typeof payload.org === 'string' ? payload.org : null,
        exp: payload.exp ?? 0,
      };
    } catch {
      return null;
    }
  }
}
