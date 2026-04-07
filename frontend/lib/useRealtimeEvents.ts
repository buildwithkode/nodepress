'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface EntryCreatedPayload {
  id: number;
  slug: string;
  contentType: string;
  locale?: string;
}

export interface EntryUpdatedPayload {
  id: number;
  slug: string;
  contentType: string;
  locale?: string;
  status?: string;
}

export interface EntryDeletedPayload {
  id: number;
  slug: string;
  contentType?: string;
}

export interface MediaUploadedPayload {
  id: number;
  filename: string;
  url: string;
  mimetype: string;
}

export interface MediaDeletedPayload {
  filename: string;
}

export interface RealtimeEventHandlers {
  onEntryCreated?: (payload: EntryCreatedPayload) => void;
  onEntryUpdated?: (payload: EntryUpdatedPayload) => void;
  onEntryDeleted?: (payload: EntryDeletedPayload) => void;
  onMediaUploaded?: (payload: MediaUploadedPayload) => void;
  onMediaDeleted?: (payload: MediaDeletedPayload) => void;
}

/**
 * Connect to the NodePress real-time WebSocket gateway and subscribe to events.
 *
 * @param handlers - Event callbacks. Stable refs are used — no need to memoize.
 * @param contentTypes - Optional list of content type names to subscribe to
 *   (joins `ct:<name>` rooms for scoped events). Omit to receive only global events.
 *
 * @example
 * useRealtimeEvents(
 *   { onEntryCreated: (p) => toast(`New entry: ${p.slug}`) },
 *   ['article', 'page'],
 * );
 */
export function useRealtimeEvents(
  handlers: RealtimeEventHandlers,
  contentTypes?: string[],
) {
  const socketRef = useRef<Socket | null>(null);
  // Keep handlers stable via ref so we don't reconnect on re-render
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    const socket = io(apiBase, {
      path: '/api/realtime',
      transports: ['websocket', 'polling'],
      withCredentials: true,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      // Subscribe to content-type rooms if requested
      contentTypes?.forEach((ct) => socket.emit('subscribe', { contentType: ct }));
    });

    socket.on('entry:created', (p: EntryCreatedPayload) => {
      handlersRef.current.onEntryCreated?.(p);
    });
    socket.on('entry:updated', (p: EntryUpdatedPayload) => {
      handlersRef.current.onEntryUpdated?.(p);
    });
    socket.on('entry:deleted', (p: EntryDeletedPayload) => {
      handlersRef.current.onEntryDeleted?.(p);
    });
    socket.on('media:uploaded', (p: MediaUploadedPayload) => {
      handlersRef.current.onMediaUploaded?.(p);
    });
    socket.on('media:deleted', (p: MediaDeletedPayload) => {
      handlersRef.current.onMediaDeleted?.(p);
    });

    return () => {
      contentTypes?.forEach((ct) => socket.emit('unsubscribe', { contentType: ct }));
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(contentTypes)]);
}
