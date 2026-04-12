import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Surfaces render errors instead of a blank root. */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-dvh bg-red-50 p-6 font-sans text-red-900">
          <h1 className="mb-2 text-lg font-semibold">Editor failed to load</h1>
          <pre className="max-h-[60vh] overflow-auto text-xs whitespace-pre-wrap">
            {this.state.error.stack ?? this.state.error.message}
          </pre>
          <p className="text-muted-foreground mt-4 text-sm text-neutral-600">
            See the browser console for the full error.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
