import { randomBytes } from 'node:crypto';
import { Controller, Inject, Logger, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import type { Database } from '@fixflow/db';
import { rooms, type ClientToServerEvents, type Role, type ServerToClientEvents } from '@fixflow/shared';
import type { Actor } from '../../common/auth/actor.js';
import { CurrentActor } from '../../common/auth/decorators.js';
import { ENV, type Env } from '../../config/env.js';
import { keys } from '../../infra/redis.js';
import { DATABASE, REDIS } from '../../infra/tokens.js';
import { workOrderVisibility } from '../work-orders/access.js';

interface TicketData {
  userId: string;
  organizationId: string;
  role: Role;
  sessionId: string;
}

type FFSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, TicketData>;

const TICKET_TTL_SECONDS = 60;

/**
 * Socket authentication uses a short-lived, single-use ticket fetched over the authenticated
 * REST API, so the browser never needs to expose its httpOnly access token to JavaScript and
 * sockets work across origins. A ticket is bound to user + organization + role.
 */
@ApiTags('realtime')
@Controller('realtime')
export class RealtimeTicketController {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  @Post('ticket')
  @ApiOperation({ summary: 'Issue a 60-second single-use ticket for the Socket.IO handshake' })
  async ticket(@CurrentActor() actor: Actor): Promise<{ ticket: string; expiresIn: number }> {
    const ticket = randomBytes(24).toString('base64url');
    const data: TicketData = {
      userId: actor.userId,
      organizationId: actor.organizationId,
      role: actor.role,
      sessionId: actor.sessionId,
    };
    await this.redis.set(keys.realtimeTicket(ticket), JSON.stringify(data), 'EX', TICKET_TTL_SECONDS);
    return { ticket, expiresIn: TICKET_TTL_SECONDS };
  }
}

@WebSocketGateway()
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async handleConnection(socket: FFSocket): Promise<void> {
    const ticket = (socket.handshake.auth as { ticket?: unknown })?.ticket;
    if (typeof ticket !== 'string' || ticket.length > 100) return this.reject(socket);
    const raw = await this.redis.getdel(keys.realtimeTicket(ticket));
    if (!raw) return this.reject(socket);
    const data = JSON.parse(raw) as TicketData;
    if (await this.redis.exists(keys.revokedSession(data.sessionId))) return this.reject(socket);

    socket.data = data;
    await socket.join(rooms.user(data.userId));
    if (data.role === 'MANAGER' || data.role === 'ORG_ADMIN') await socket.join(rooms.orgManagers(data.organizationId));
    // Re-authenticate periodically: the client reconnects with a fresh ticket.
    const timer = setTimeout(() => socket.disconnect(true), this.env.ACCESS_TOKEN_TTL_SECONDS * 1000);
    socket.once('disconnect', () => clearTimeout(timer));
  }

  private reject(socket: FFSocket): void {
    socket.emit('session.expired');
    socket.disconnect(true);
  }

  /** Join a work order room only after the same visibility check as the REST endpoint. */
  @SubscribeMessage('workOrder.watch')
  async watch(@ConnectedSocket() socket: FFSocket, @MessageBody() body: { id?: unknown }): Promise<{ ok: boolean }> {
    const data = socket.data;
    const id = typeof body?.id === 'string' ? body.id : null;
    if (!data?.userId || !id || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false };
    try {
      const visible = await this.db.tx({ organizationId: data.organizationId, userId: data.userId }, async (tx) => {
        const org = await tx.organization.findUniqueOrThrow({
          where: { id: data.organizationId },
          select: { requesterSeesAllOrgRequests: true, technicianSelfAssign: true },
        });
        return tx.workOrder.count({
          where: { id, organizationId: data.organizationId, ...workOrderVisibility({ userId: data.userId, role: data.role }, org) },
        });
      });
      if (!visible) return { ok: false };
      await socket.join(rooms.workOrder(data.organizationId, id));
      return { ok: true };
    } catch (err) {
      this.logger.warn({ err }, 'watch failed');
      return { ok: false };
    }
  }

  @SubscribeMessage('workOrder.unwatch')
  async unwatch(@ConnectedSocket() socket: FFSocket, @MessageBody() body: { id?: unknown }): Promise<void> {
    if (socket.data?.organizationId && typeof body?.id === 'string') {
      await socket.leave(rooms.workOrder(socket.data.organizationId, body.id));
    }
  }

  /** Force-disconnect a user's sockets everywhere (logout, membership suspension). */
  disconnectUser(userId: string): void {
    this.server.in(rooms.user(userId)).disconnectSockets(true);
  }
}
