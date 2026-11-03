import { useEffect, useState, type CSSProperties } from 'react';

/**
 * Measures an editor's sticky header (see STICKY_HEADER in components/SidePane.ts), whose height
 * changes as its controls wrap: the side pane sticks below it through --sticky-header-h, and tabbing
 * to a field or jumping to a validation error must not land under the bars (the top bar is 56px).
 */
export function useStickyHeader() {
  // A callback ref, because some editors render the header only after they have loaded.
  const [header, stickyHeaderRef] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!header) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      setHeight(header.offsetHeight);
      const covered = getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0;
      root.style.scrollPaddingTop = `${56 + covered + 16}px`;
    });
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.scrollPaddingTop = '';
    };
  }, [header]);

  return { stickyHeaderRef, paneRowStyle: { '--sticky-header-h': `${height}px` } as CSSProperties };
}
