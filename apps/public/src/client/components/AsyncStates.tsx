import type { PublicApiError } from '../api/public-api-client';

export function LoadingState({ label = 'Loading Registry data' }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="loading-indicator" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({
  action,
  description,
  title,
}: {
  action?: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="empty-state" aria-labelledby="empty-state-title">
      <h2 id="empty-state-title">{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = 'Registry data could not be loaded',
}: {
  error: PublicApiError;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <section className="error-state" role="alert" aria-labelledby="error-state-title">
      <h2 id="error-state-title">{title}</h2>
      <p>{error.message}</p>
      {error.requestId ? <p className="request-id">Request ID: {error.requestId}</p> : null}
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
