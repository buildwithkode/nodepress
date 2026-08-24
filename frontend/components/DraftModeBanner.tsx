'use client';

import React from 'react';
import Link from 'next/link';

interface DraftModeBannerProps {
  redirectPath?: string;
}

export function DraftModeBanner({ redirectPath = '/' }: DraftModeBannerProps) {
  return (
    <aside
      aria-label="Draft Preview Mode"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-full border border-amber-500/30 bg-background/90 px-4 py-2 text-xs shadow-2xl backdrop-blur-md transition-all hover:bg-background"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
        </span>
        <span className="font-semibold text-foreground">Draft Mode Active</span>
      </div>
      <span className="text-muted-foreground">·</span>
      <span className="hidden text-muted-foreground sm:inline">Viewing unpublished content</span>
      <Link
        href={`/api/disable-draft?redirect=${encodeURIComponent(redirectPath)}`}
        prefetch={false}
        className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
      >
        Exit Preview
      </Link>
    </aside>
  );
}
