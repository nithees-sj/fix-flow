import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import { REALTIME_PATH } from '@fixflow/shared';
import type { Env } from '../../config/env.js';
import { createRedis } from '../../infra/redis.js';

/**
 * Socket.IO server on /realtime with the Redis adapter, so events published by any API
 * instance or by the worker (redis-emitter) reach clients connected to any instance.
 */
export class RealtimeIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly env: Env,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...(options as ServerOptions),
      path: REALTIME_PATH,
      cors: { origin: this.env.CORS_ORIGINS, credentials: true },
      serveClient: false,
      connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000 },
    } as ServerOptions) as Server;
    const pub = createRedis(this.env.REDIS_URL);
    const sub = pub.duplicate();
    server.adapter(createAdapter(pub, sub));
    return server;
  }
}
