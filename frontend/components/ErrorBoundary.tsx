'use client';

import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/report-error';

interface Props {
  children: ReactNode;
  /** Optional label shown in the error card (e.g. "Entries", "Media") */
  label?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * React error boundary — catches render/lifecycle errors in children and
 * shows a recovery card instead of crashing the whole admin panel.
 *
 * Usage:
 *   <ErrorBoundary label="Entries"><EntriesPage /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Reports to Sentry when it's installed + initialised; no-op otherwise.
    reportError(error, { componentStack: info.componentStack });
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { label = 'this section' } = this.props;

    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
        <div className="rounded-full bg-destructive/10 p-4 mb-4">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-base font-semibold text-foreground mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-muted-foreground mb-1 max-w-sm">
          {label.charAt(0).toUpperCase() + label.slice(1)} failed to load.
          This has been reported automatically.
        </p>
        {this.state.message && (
          <p className="text-xs text-muted-foreground/60 font-mono mb-4 max-w-sm truncate">
            {this.state.message}
          </p>
        )}
        <Button variant="outline" size="sm" onClick={this.handleReset}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Try again
        </Button>
      </div>
    );
  }
}
