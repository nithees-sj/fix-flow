'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { REALTIME_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@fixflow/shared';
import { api } from './api';
import { qk } from './query-client';

type FFSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Status = 'connecting' | 'live' | 'offline';

const RealtimeContext = createContext<{ socket: FFSocket | null; status: Status }>({ socket: null, status: 'connecting' });
export const useRealtime = () => useContext(RealtimeContext);

const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? 'http://localhost:4000';

/**
 * Socket.IO connection for the signed-in organization. Each (re)connect fetches a fresh
 * single-use ticket over the authenticated REST API. Server events are invalidation hints:
 * the relevant TanStack queries refetch through REST, so authorization stays server-side.
 * After a reconnect every active query is invalidated to reconcile with server state.
 */
export function RealtimeProvider({ organizationId, children }: { organizationId: string; children: React.ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('connecting');
  const [socket, setSocket] = useState<FFSocket | null>(null);
  const everConnected = useRef(false);

  useEffect(() => {
    const s: FFSocket = io(REALTIME_URL, {
      path: REALTIME_PATH,
      transports: ['websocket'],
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15_000,
      auth: (cb) => {
        api<{ ticket: string }>('/realtime/ticket', { method: 'POST' })
          .then((r) => cb({ ticket: r.ticket }))
          .catch(() => cb({ ticket: '' }));
      },
    });

    const invalidateWorkOrder = (id?: string) => {
      void qc.invalidateQueries({ queryKey: qk.workOrdersAll });
      if (id) void qc.invalidateQueries({ queryKey: qk.workOrder(id) });
    };
    s.on('connect', () => {
      setSocket(s);
      setStatus('live');
      if (everConnected.current) void qc.invalidateQueries(); // reconcile after a gap
      everConnected.current = true;
    });
    s.on('disconnect', () => setStatus('offline'));
    s.io.on('reconnect_attempt', () => setStatus('connecting'));
    s.on('workOrder.created', () => {
      invalidateWorkOrder();
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    });
    s.on('workOrder.updated', (p) => invalidateWorkOrder(p.id));
    s.on('workOrder.commented', (p) => void qc.invalidateQueries({ queryKey: qk.timeline(p.workOrderId) }));
    s.on('notification.created', () => void qc.invalidateQueries({ queryKey: qk.notifications }));
    s.on('dashboard.invalidate', () => void qc.invalidateQueries({ queryKey: ['dashboard'] }));
    s.on('session.expired', () => void qc.invalidateQueries({ queryKey: qk.me }));
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
      setStatus('connecting');
    };
  }, [organizationId, qc]);

  return <RealtimeContext.Provider value={{ socket, status }}>{children}</RealtimeContext.Provider>;
}

/** Joins the work-order room while a detail page is open (server checks visibility). */
export function useWatchWorkOrder(id: string | undefined) {
  const { socket, status } = useRealtime();
  useEffect(() => {
    if (!socket || !id || status !== 'live') return;
    socket.emit('workOrder.watch', { id }, () => undefined);
    return () => {
      socket.emit('workOrder.unwatch', { id });
    };
  }, [socket, id, status]);
}
