'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  label: string;
  fallback?: ReactNode;
};

type State = {
  error: string | null;
};

export class ClientWidgetBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : 'Client widget failed' };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const report = {
      digest: `client-widget:${this.props.label}`,
      name: error instanceof Error ? error.name : 'ClientWidgetError',
      message: error instanceof Error ? error.message : 'Client widget failed',
      path: window.location.pathname + window.location.search,
      userAgent: window.navigator.userAgent,
      diagnostics: {
        widget: this.props.label,
        componentStack: info.componentStack
      }
    };
    console.error('BONDR client widget error', report);
    void fetch('/api/client-error-report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(report)
    }).catch(() => undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="clientWidgetFallback" role="status" aria-live="polite">
        <strong>{this.props.label}</strong>
        <span>Widget paused</span>
      </div>
    );
  }
}
