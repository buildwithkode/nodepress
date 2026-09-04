'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  Menu,
  X,
  FileText,
  ArrowRight,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

export interface NavItem {
  name: string;
  label: string;
  href: string;
}

interface PublicHeaderProps {
  types: NavItem[];
}

export default function PublicHeader({ types }: PublicHeaderProps) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "More" dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
        setIsMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsMoreOpen(false);
  }, [pathname]);

  // Max primary links to display horizontally on desktop before grouping into "More"
  const PRIMARY_LINK_LIMIT = 3;
  const primaryLinks = types.slice(0, PRIMARY_LINK_LIMIT);
  const overflowLinks = types.slice(PRIMARY_LINK_LIMIT);

  const isMoreActive = overflowLinks.some((item) => pathname.startsWith(item.href));

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-4 sm:px-8 py-3 transition-colors">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        {/* Left: Brand & Navigation */}
        <div className="flex items-center gap-6">
          <Link
            href="/posts"
            className="flex items-center gap-2.5 text-gray-900 no-underline font-extrabold text-lg tracking-tight shrink-0 group"
          >
            <span className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center text-sm font-black shadow-sm group-hover:scale-105 transition-transform">
              N
            </span>
            <span>
              NodePress
              <span className="text-blue-600 text-xs font-semibold uppercase tracking-wider ml-1.5 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100">
                Live
              </span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1.5 text-xs font-medium text-gray-600">
            {primaryLinks.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg transition-colors no-underline ${
                    active
                      ? 'text-blue-600 bg-blue-50 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}

            {/* "More" Overflow Dropdown for any extra content types */}
            {overflowLinks.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(!isMoreOpen)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border-none bg-transparent text-xs font-medium ${
                    isMoreActive || isMoreOpen
                      ? 'text-blue-600 bg-blue-50 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span>More</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-gray-200 text-gray-700 font-mono">
                    +{overflowLinks.length}
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      isMoreOpen ? 'rotate-180 text-blue-600' : ''
                    }`}
                  />
                </button>

                {isMoreOpen && (
                  <div className="absolute left-0 mt-2 w-56 rounded-xl bg-white border border-gray-200/90 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100 mb-1">
                      More Content Types
                    </div>
                    {overflowLinks.map((item) => {
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setIsMoreOpen(false)}
                          className={`flex items-center justify-between px-3.5 py-2 text-xs transition-colors no-underline ${
                            active
                              ? 'text-blue-600 bg-blue-50/80 font-semibold'
                              : 'text-gray-700 hover:text-blue-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-gray-400" />
                            {item.label}
                          </span>
                          {active && (
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <Link
              href="/docs"
              className={`px-3 py-1.5 rounded-lg transition-colors no-underline ${
                pathname === '/docs'
                  ? 'text-blue-600 bg-blue-50 font-semibold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Docs
            </Link>
          </nav>
        </div>

        {/* Right: Actions & Mobile Hamburger */}
        <div className="flex items-center gap-2.5">
          <Link
            href="/docs"
            className="text-xs text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg transition-colors no-underline hidden sm:block"
          >
            API Docs
          </Link>

          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-900 hover:bg-black text-white rounded-lg px-3.5 py-1.5 shadow-sm transition-all no-underline"
          >
            Admin Panel <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border-none bg-transparent cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-gray-100 mt-3 pt-3 pb-4 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Navigation
          </div>
          {types.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors no-underline ${
                  active
                    ? 'text-blue-600 bg-blue-50 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  {item.label}
                </span>
                {active && (
                  <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
                    Active
                  </span>
                )}
              </Link>
            );
          })}

          <Link
            href="/docs"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100 no-underline"
          >
            <FileText className="h-4 w-4 text-gray-400" />
            API Docs
          </Link>

          <div className="pt-3 mt-2 border-t border-gray-100">
            <Link
              href="/"
              className="flex items-center justify-center gap-2 w-full text-sm font-semibold bg-gray-900 hover:bg-black text-white rounded-xl py-2.5 shadow-sm transition-all no-underline"
            >
              Open Admin Panel <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
