import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { validateHandle } from '@open-creator-registry/normalization';

import { PublicApiError, publicApi } from '../api/public-api-client';
import type { HandleCheckResult } from '../api/schemas';
import { PageIntro } from '../components/PageIntro';
import { ProtectionResult } from '../components/ProtectionResult';
import { SearchIcon } from '../components/Icons';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const examples = [
  'demo_aurora_vale',
  'real-demo-aurora-vale',
  'demo_aurora_vale_fans',
  'ordinary_name',
];

export default function HandleCheckPage() {
  useDocumentTitle('Check a handle');
  const [searchParams, setSearchParams] = useSearchParams();
  const [initialHandle] = useState(() => searchParams.get('handle') ?? '');
  const [handle, setHandle] = useState(initialHandle);
  const [result, setResult] = useState<HandleCheckResult | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);
  const [validationMessage, setValidationMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const check = useCallback(async (candidate: string, onValidated?: () => void) => {
    const validation = validateHandle(candidate);
    if (!validation.valid) {
      setValidationMessage(
        validation.issues[0]?.message ?? 'Enter a supported username or handle.',
      );
      setResult(null);
      setError(null);
      return;
    }

    onValidated?.();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setValidationMessage('');
    setLoading(true);
    setError(null);
    try {
      const response = await publicApi.checkHandle(candidate, controller.signal);
      setResult(response.data);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setResult(null);
      setError(
        requestError instanceof PublicApiError
          ? requestError
          : new PublicApiError({
              code: 'unexpected_error',
              message: 'The handle check failed unexpectedly.',
              status: 0,
            }),
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialHandle) return;
    const timeout = window.setTimeout(() => void check(initialHandle), 0);
    return () => window.clearTimeout(timeout);
  }, [check, initialHandle]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void check(handle, () => setSearchParams({ handle: handle.trim() }, { replace: true }));
  }

  function reset() {
    controllerRef.current?.abort();
    setHandle('');
    setResult(null);
    setError(null);
    setValidationMessage('');
    setLoading(false);
    setSearchParams({}, { replace: true });
  }

  return (
    <div className="page-container checker-page">
      <PageIntro
        title="Check a handle’s protection status."
        description={
          <p>
            Submit one username deliberately. The Registry checks local public decisions and returns
            a protection classification — never platform availability.
          </p>
        }
      />

      <section className="checker-workspace" aria-labelledby="checker-form-title">
        <div className="checker-form-panel">
          <h2 id="checker-form-title">Username to check</h2>
          <form className="handle-check-form" onSubmit={submit} noValidate>
            <label htmlFor="handle-check-input">Username or handle</label>
            <div className="search-input-wrap">
              <SearchIcon />
              <span aria-hidden="true">@</span>
              <input
                id="handle-check-input"
                name="handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                maxLength={128}
                autoComplete="off"
                aria-invalid={Boolean(validationMessage)}
                aria-describedby={validationMessage ? 'handle-check-error' : 'handle-check-help'}
              />
            </div>
            <p className="field-help" id="handle-check-help">
              Leading @ symbols, spaces, periods, and hyphens are normalized for comparison.
            </p>
            {validationMessage ? (
              <p className="field-error" id="handle-check-error">
                {validationMessage}
              </p>
            ) : null}
            <div className="form-actions">
              <button className="primary-button" type="submit" disabled={loading}>
                {loading ? 'Checking…' : 'Check protection status'}
              </button>
              <button
                className="text-button"
                type="button"
                onClick={reset}
                disabled={loading && !handle}
              >
                Clear
              </button>
            </div>
          </form>
          <div className="example-handles">
            <span>Try demonstration data:</span>
            <div>
              {examples.map((example) => (
                <button
                  type="button"
                  key={example}
                  onClick={() => {
                    setHandle(example);
                    void check(example, () =>
                      setSearchParams({ handle: example }, { replace: true }),
                    );
                  }}
                >
                  @{example}
                </button>
              ))}
            </div>
          </div>
          <Link className="inline-link" to="/api-tester">
            Test the underlying public API
          </Link>
          <a className="inline-link" href="/docs">
            Open full API documentation
          </a>
        </div>

        <div className="checker-result-panel" aria-busy={loading}>
          {loading ? (
            <div className="checker-placeholder" role="status" aria-live="polite">
              <span className="loading-indicator" aria-hidden="true" />
              <p>Checking the local Registry…</p>
            </div>
          ) : null}
          {!loading && error ? (
            <section className="error-state" role="alert">
              <h2>Handle check failed</h2>
              <p>{error.message}</p>
              {error.requestId ? <p className="request-id">Request ID: {error.requestId}</p> : null}
              <button className="secondary-button" type="button" onClick={() => void check(handle)}>
                Try again
              </button>
            </section>
          ) : null}
          {!loading && result ? <ProtectionResult result={result} /> : null}
          {!loading && !error && !result ? (
            <div className="checker-placeholder">
              <p className="checker-placeholder__title">A Registry result will appear here.</p>
              <p>
                You’ll see the classification, match signal, recommended platform action, and
                current Registry version.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
