import { type FormEvent, useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { registryClassifications } from '@open-creator-registry/contracts/classifications';

import { publicApi } from '../api/public-api-client';
import { ArrowIcon, SearchIcon } from '../components/Icons';
import { classificationContent } from '../components/classification-content';
import { Disclaimer } from '../components/Disclaimer';
import { ErrorState, LoadingState } from '../components/AsyncStates';
import { RegistryIllustration } from '../components/RegistryIllustration';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function HomePage() {
  useDocumentTitle('Public creator protection registry');
  const navigate = useNavigate();
  const [handle, setHandle] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const loadMeta = useCallback((signal: AbortSignal) => publicApi.getRegistryMeta(signal), []);
  const { resource: metadata, retry } = useAsyncResource(loadMeta);

  function submitHandle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!handle.trim()) {
      setValidationMessage('Enter a username or handle to check.');
      return;
    }
    setValidationMessage('');
    void navigate(`/check?handle=${encodeURIComponent(handle.trim())}`);
  }

  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <h1>Know when a creator handle needs protection.</h1>
          <p className="hero-summary">
            Check a username’s protection classification before your platform assigns it, or explore
            the public creator records behind Registry decisions.
          </p>
          <form className="registry-search" onSubmit={submitHandle} noValidate>
            <label htmlFor="home-handle">Username or handle</label>
            <div className="search-input-wrap">
              <SearchIcon />
              <span aria-hidden="true">@</span>
              <input
                id="home-handle"
                name="handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="demo_aurora_vale"
                aria-describedby={validationMessage ? 'home-handle-error' : undefined}
                aria-invalid={Boolean(validationMessage)}
                maxLength={128}
              />
            </div>
            {validationMessage ? (
              <p className="field-error" id="home-handle-error">
                {validationMessage}
              </p>
            ) : null}
            <button type="submit">Check protection status</button>
          </form>
          <div className="hero-links">
            <Link className="api-link" to="/creators">
              <span>Explore creator records</span>
              <ArrowIcon />
            </Link>
            <a className="api-link" href="/docs">
              <span>Read the API docs</span>
              <ArrowIcon />
            </a>
          </div>
        </div>

        <div className="hero-system" aria-label="Protection classifications">
          <RegistryIllustration />
          <div className="classification-key">
            {registryClassifications.map((classification) => (
              <div className="classification-item" key={classification}>
                <span className={`classification-dot ${classification}`} aria-hidden="true" />
                <span>{classificationContent[classification].label}</span>
              </div>
            ))}
          </div>
          <Disclaimer compact />
        </div>
      </section>

      <section className="home-section home-section--tinted" aria-labelledby="registry-state-title">
        <div>
          <h2 id="registry-state-title">A public decision record, not an availability service.</h2>
          <p>
            Platforms use the Registry after checking their own user database. A protection result
            informs claim, review, or monitoring policy; it never grants a username.
          </p>
        </div>
        <div className="registry-meta-summary">
          {metadata.status === 'loading' ? <LoadingState label="Loading Registry status" /> : null}
          {metadata.status === 'error' ? (
            <ErrorState error={metadata.error} onRetry={retry} />
          ) : null}
          {metadata.status === 'success' ? (
            <>
              <p className="registry-state-label">
                {metadata.data.data.current_registry_version
                  ? `Published version ${metadata.data.data.current_registry_version}`
                  : 'Unversioned development state'}
              </p>
              <dl>
                <div>
                  <dt>Approved public creators</dt>
                  <dd>{metadata.data.data.record_counts.approved_creators}</dd>
                </div>
                <div>
                  <dt>Active protected handles</dt>
                  <dd>{metadata.data.data.record_counts.active_reserved_handles}</dd>
                </div>
              </dl>
              {metadata.data.data.demonstration_data ? (
                <p className="demonstration-notice">
                  Local demonstration data only — not a complete or authoritative global Registry.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section
        className="home-section classification-overview"
        aria-labelledby="classification-title"
      >
        <div className="section-heading">
          <h2 id="classification-title">Four classifications, one conservative boundary.</h2>
          <p>Each response recommends what a consuming platform should do next.</p>
        </div>
        <div className="classification-lines">
          {registryClassifications.map((classification) => (
            <article key={classification}>
              <span className={`classification-dot ${classification}`} aria-hidden="true" />
              <div>
                <h3>{classificationContent[classification].title}</h3>
                <p>{classificationContent[classification].description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="home-cta" aria-labelledby="contribute-title">
        <div>
          <h2 id="contribute-title">Help improve the public Registry.</h2>
          <p>
            Suggest a creator with public sources. Every proposal enters review and does not reserve
            a username immediately.
          </p>
        </div>
        <Link className="primary-button" to="/submit">
          Submit a creator
        </Link>
      </section>
    </>
  );
}
