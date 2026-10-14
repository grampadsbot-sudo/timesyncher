import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Vacation client render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tsv-error" role="alert">
          <h1>Something went wrong</h1>
          <p>We could not show this trip. Refresh the page or try again later.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
