import { useCallback, useEffect, useState } from 'react';

import { AdminApiError } from '../api/admin-api-client';

export type AdminResource<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AdminApiError };

export function useAdminResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  key = 'default',
  enabled = true,
) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ key: string; resource: AdminResource<T> } | null>(null);
  const requestKey = `${key}:${attempt}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setSettled({ key: requestKey, resource: { status: 'success', data } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const apiError =
          error instanceof AdminApiError
            ? error
            : new AdminApiError({
                code: 'unexpected_error',
                message: 'The administration view could not be loaded.',
                status: 0,
              });
        setSettled({ key: requestKey, resource: { status: 'error', error: apiError } });
      });
    return () => controller.abort();
  }, [enabled, load, requestKey]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    resource: settled?.key === requestKey ? settled.resource : ({ status: 'loading' } as const),
    retry,
  };
}
