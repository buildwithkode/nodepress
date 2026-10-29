'use client';

import { useEffect, useState } from 'react';
import api from './axios';

let cached: number | undefined;

/** The server's media size limit in MB (MEDIA_MAX_MB, shown before the first answer as the default 10). */
export function useUploadLimitMb(): number {
  const [mb, setMb] = useState(cached ?? 10);
  useEffect(() => {
    if (cached !== undefined) return;
    api.get('/media', { params: { limit: 1 } })
      .then((res) => {
        const bytes = res.data?.meta?.maxUploadBytes;
        if (typeof bytes === 'number' && bytes > 0) {
          cached = Math.round(bytes / 1024 / 1024);
          setMb(cached);
        }
      })
      .catch(() => { /* keep the default */ });
  }, []);
  return mb;
}
