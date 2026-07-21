import { useCallback, useEffect, useState } from 'react';

import { PublicApiError } from '../api/public-api-client';

export type AsyncResource<T> =
  | { key: string; status: 'success'; data: T }
  | { key: string; status: 'error'; error: PublicApiError };

function toPublicApiError(error: unknown) {
  if (error instanceof PublicApiError) return error;
  return new PublicApiError({
    code: 'unexpected_error',
    message: 'Something unexpected happened while loading Registry data.',
    status: 0,
  });
}

export function useAsyncResource<T>(load: (signal: AbortSignal) => Promise<T>, key = 'default') {
  const [attempt, setAttempt] = useState(0);
  const [settledResource, setSettledResource] = useState<AsyncResource<T> | null>(null);
  const requestKey = `${key}:${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setSettledResource({ key: requestKey, status: 'success', data });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSettledResource({
            key: requestKey,
            status: 'error',
            error: toPublicApiError(error),
          });
        }
      });
    return () => controller.abort();
  }, [load, requestKey]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const resource =
    settledResource?.key === requestKey ? settledResource : ({ status: 'loading' } as const);
  return { resource, retry };
}
