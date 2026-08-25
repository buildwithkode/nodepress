'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import Cookies from 'js-cookie';
import { toast } from 'sonner';

export interface PresenceUser {
  id: number;
  email: string;
  role: string;
  joinedAt: number;
}

export interface EntryLockInfo {
  userId: number;
  email: string;
  role: string;
  lockedAt: number;
  expiresAt: number;
}

export function useEntryPresence(entryId: number | null | undefined, currentUserId?: number) {
  const socketRef = useRef<Socket | null>(null);
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const [lock, setLock] = useState<EntryLockInfo | null>(null);
  const heartbeatTimerRef = useRef<any>(null);

  const isLockedByOther = Boolean(lock && currentUserId && lock.userId !== currentUserId && lock.expiresAt > Date.now());
  const hasLock = Boolean(lock && currentUserId && lock.userId === currentUserId && lock.expiresAt > Date.now());

  const requestLock = useCallback(() => {
    if (!socketRef.current || !entryId) return;
    socketRef.current.emit('entry:requestLock', { entryId }, (res: any) => {
      if (res?.acquired && res?.lock) {
        setLock(res.lock);
      }
    });
  }, [entryId]);

  const takeoverLock = useCallback(() => {
    if (!socketRef.current || !entryId) return;
    socketRef.current.emit('entry:takeoverLock', { entryId }, (res: any) => {
      if (res?.acquired && res?.lock) {
        setLock(res.lock);
        toast.success('Lock taken over successfully');
      } else {
        toast.error(res?.message || 'Could not take over lock');
      }
    });
  }, [entryId]);

  const releaseLock = useCallback(() => {
    if (!socketRef.current || !entryId) return;
    socketRef.current.emit('entry:releaseLock', { entryId });
    setLock(null);
  }, [entryId]);

  useEffect(() => {
    if (!entryId) return;

    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const token = Cookies.get('np_token');

    const socket = io(apiBase, {
      path: '/api/realtime',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: token ? { token: `Bearer ${token}` } : {},
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('entry:join', { entryId }, (res: any) => {
        if (res?.users) setActiveUsers(res.users);
        if (res?.lock) setLock(res.lock);
        // Automatically attempt to acquire lock if free
        if (!res?.lock || res?.lock?.expiresAt < Date.now()) {
          socket.emit('entry:requestLock', { entryId }, (lockRes: any) => {
            if (lockRes?.acquired && lockRes?.lock) setLock(lockRes.lock);
          });
        }
      });
    });

    socket.on('entry:presence', (data: { entryId: number; users: PresenceUser[] }) => {
      if (data.entryId === entryId) {
        setActiveUsers(data.users);
      }
    });

    socket.on('entry:lockAcquired', (data: { entryId: number; lock: EntryLockInfo }) => {
      if (data.entryId === entryId) {
        setLock(data.lock);
      }
    });

    socket.on('entry:lockReleased', (data: { entryId: number }) => {
      if (data.entryId === entryId) {
        setLock(null);
      }
    });

    socket.on('entry:lockTakeover', (data: { entryId: number; previousLock: EntryLockInfo; newLock: EntryLockInfo }) => {
      if (data.entryId === entryId) {
        setLock(data.newLock);
        if (currentUserId && data.previousLock?.userId === currentUserId && data.newLock?.userId !== currentUserId) {
          toast.warning(`${data.newLock.email} has taken over the editing lock.`);
        }
      }
    });

    // Heartbeat every 25 seconds while holding lock
    heartbeatTimerRef.current = setInterval(() => {
      if (socket.connected && entryId) {
        socket.emit('entry:heartbeat', { entryId });
      }
    }, 25000);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (socket.connected) {
        socket.emit('entry:leave', { entryId });
      }
      socket.disconnect();
    };
  }, [entryId, currentUserId]);

  return {
    activeUsers,
    lock,
    isLockedByOther,
    hasLock,
    requestLock,
    takeoverLock,
    releaseLock,
  };
}
