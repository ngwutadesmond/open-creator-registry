import type { ReactNode } from 'react';

import type { AdminApiError } from '../api/admin-api-client';

export function LoadingState({ label = 'Loading administration data…' }: { label?: string }) {
  return (
    <div className="admin-state" role="status">
      <span className="loading-line" />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  description,
  action,
}: {
  title: string;
  message?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="admin-empty">
      <h2>{title}</h2>
      <p>{description ?? message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: AdminApiError; onRetry?: () => void }) {
  return (
    <div className="admin-error" role="alert">
      <h2>Unable to load this view</h2>
      <p>{error.message}</p>
      {error.requestId ? <p className="request-id">Request ID: {error.requestId}</p> : null}
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
