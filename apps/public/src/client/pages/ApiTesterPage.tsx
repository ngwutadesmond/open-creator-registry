import { type FormEvent, useMemo, useRef, useState } from 'react';

import { type ApiTesterEndpoint, PublicApiError, runApiTest } from '../api/public-api-client';
import { CopyableCodeBlock } from '../components/CopyableCodeBlock';
import { PageIntro } from '../components/PageIntro';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type TestResult = Awaited<ReturnType<typeof runApiTest>>;

const endpointDescriptions: Record<ApiTesterEndpoint, string> = {
  creators: 'Search approved public creator records.',
  handle: 'Check one username’s protection classification.',
  health: 'Inspect API and local database health.',
  meta: 'Inspect public Registry counts and version state.',
};

function createCurl(url: string) {
  const absolute = new URL(url, window.location.origin).toString();
  return `curl --header 'Accept: application/json' '${absolute}'`;
}

export default function ApiTesterPage() {
  useDocumentTitle('Public API tester');
  const [endpoint, setEndpoint] = useState<ApiTesterEndpoint>('health');
  const [handle, setHandle] = useState('demo_aurora_vale');
  const [query, setQuery] = useState('Aurora Vale');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<PublicApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestPreview = useMemo(() => {
    if (endpoint === 'handle') return `/api/v1/handles/check?handle=${encodeURIComponent(handle)}`;
    if (endpoint === 'creators')
      return `/api/v1/creators?limit=5&query=${encodeURIComponent(query)}`;
    if (endpoint === 'meta') return '/api/v1/registry/meta';
    return '/api/v1/health';
  }, [endpoint, handle, query]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const response = await runApiTest(endpoint, { handle, query }, controller.signal);
      setResult(response);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
      setError(
        requestError instanceof PublicApiError
          ? requestError
          : new PublicApiError({
              code: 'unexpected_error',
              message: 'The test request failed unexpectedly.',
              status: 0,
            }),
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="page-container api-tester-page">
      <PageIntro
        title="Test the public Registry API."
        description={
          <p>
            Send a real request to a supported public GET endpoint and inspect its status, request
            ID, cache policy, and JSON response. For the full contract, open the generated docs.
          </p>
        }
      />

      <div className="api-tester-layout">
        <form className="api-tester-controls" onSubmit={(event) => void send(event)}>
          <label>
            Public endpoint
            <select
              value={endpoint}
              onChange={(event) => setEndpoint(event.target.value as ApiTesterEndpoint)}
            >
              <option value="health">Health</option>
              <option value="handle">Single handle check</option>
              <option value="creators">Creator search</option>
              <option value="meta">Registry metadata</option>
            </select>
          </label>
          <p>{endpointDescriptions[endpoint]}</p>
          {endpoint === 'handle' ? (
            <label>
              Handle
              <input
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                maxLength={128}
              />
            </label>
          ) : null}
          {endpoint === 'creators' ? (
            <label>
              Search query
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                maxLength={120}
              />
            </label>
          ) : null}
          <div className="request-preview">
            <span>GET</span>
            <code>{requestPreview}</code>
          </div>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? 'Sending request…' : 'Send request'}
          </button>
          <a className="secondary-button" href="/docs">
            Open full API documentation
          </a>
        </form>

        <section
          className="api-tester-output"
          aria-labelledby="api-output-title"
          aria-busy={loading}
        >
          <h2 id="api-output-title">Response</h2>
          {loading ? (
            <div className="loading-state" role="status" aria-live="polite">
              <span className="loading-indicator" aria-hidden="true" />
              Sending public API request…
            </div>
          ) : null}
          {!loading && error ? (
            <div className="error-state" role="alert">
              <h3>Request failed</h3>
              <p>{error.message}</p>
              {error.requestId ? <p className="request-id">Request ID: {error.requestId}</p> : null}
            </div>
          ) : null}
          {!loading && !error && !result ? (
            <p className="api-output-placeholder">
              Select an endpoint and send a request to inspect the live response.
            </p>
          ) : null}
          {!loading && result ? (
            <div aria-live="polite">
              <dl className="response-metadata">
                <div>
                  <dt>HTTP status</dt>
                  <dd>{result.status}</dd>
                </div>
                <div>
                  <dt>Request ID</dt>
                  <dd className="request-id">{result.requestId ?? 'Not returned'}</dd>
                </div>
                <div>
                  <dt>Cache-Control</dt>
                  <dd>{result.cacheControl ?? 'Not returned'}</dd>
                </div>
              </dl>
              <CopyableCodeBlock label="Request example" value={createCurl(result.requestUrl)} />
              <CopyableCodeBlock
                label="JSON response"
                value={JSON.stringify(result.body, null, 2)}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
