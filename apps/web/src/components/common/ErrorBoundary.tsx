import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@marche/ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// A render-time throw anywhere in the tree used to unmount the whole app
// with nothing but a console error — no fallback existed at any level.
// React only offers this as a class component; there is no hook
// equivalent for componentDidCatch.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-surface-subtle flex items-center justify-center text-destructive">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="text-base font-medium text-ink">Something went wrong</h1>
          <p className="text-sm text-ink-muted">
            An unexpected error occurred. Reloading the page usually fixes it.
          </p>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    );
  }
}
