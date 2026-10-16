'use client';

import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';

/**
 * Open a Socket.io connection to the backend's realtime gateway.
 *
 * The gateway lives on the `/realtime` namespace (path `/api/realtime`). The
 * namespace must be part of the URL: connecting to the bare backend URL joins
 * the default `/` namespace, which accepts the connection but never receives
 * any events.
 *
 * NEXT_PUBLIC_API_URL is inlined in local dev and must be set when the backend
 * is on another origin. When unset, the page's own origin is used, which is
 * correct behind the bundled nginx (it proxies /api/realtime to the backend).
 */
export function connectRealtime(): Socket {
  const base = (process.env.NEXT_PUBLIC_API_URL || window.location.origin).replace(/\/+$/, '');
  const token = Cookies.get('np_token');

  return io(`${base}/realtime`, {
    path: '/api/realtime',
    // WebSocket first; long-polling only if WebSockets are blocked. Polling
    // across several backend replicas needs sticky sessions (nginx ip_hash).
    transports: ['websocket', 'polling'],
    withCredentials: true,
    // Pass the JWT so the gateway can authenticate this connection
    auth: token ? { token: `Bearer ${token}` } : {},
  });
}
