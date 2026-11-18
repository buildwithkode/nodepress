import type { Metadata } from 'next';

// Share links are private previews: never indexed, never sent as a referrer.
export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
