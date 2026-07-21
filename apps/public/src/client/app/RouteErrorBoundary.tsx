import { Component, type ReactNode } from 'react';

type State = { error: Error | null };

export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override render() {
    if (this.state.error) {
      return (
        <main className="page-container route-error" id="main-content">
          <h1>This page could not be displayed</h1>
          <p>The Registry interface encountered an unexpected response.</p>
          <button className="primary-button" type="button" onClick={() => window.location.reload()}>
            Reload the page
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
