import { type FormEvent, useState } from 'react';

import { registryClassifications } from '@open-creator-registry/contracts/classifications';

import { getRegistrySearchMessage } from './phase-messages';

const classificationLabels = {
  hard_reserved: 'Hard reserved',
  soft_protected: 'Soft protected',
  monitored: 'Monitored',
  not_listed: 'Not listed',
} as const;

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <circle cx="10.75" cy="10.75" r="6.75" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 12h13m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RegistryIllustration() {
  return (
    <svg
      className="registry-illustration"
      viewBox="0 0 720 420"
      role="img"
      aria-labelledby="registry-illustration-title registry-illustration-description"
    >
      <title id="registry-illustration-title">Registry classification process</title>
      <desc id="registry-illustration-description">
        Names and aliases converge into one registry record and four protection classifications.
      </desc>
      <g className="source-records">
        {[60, 122, 184, 246, 308].map((y) => (
          <g key={y}>
            <rect x="18" y={y} width="150" height="42" rx="6" />
            <path d={`M44 ${y + 21}h74`} />
            <path className="connector" d={`M168 ${y + 21}h72Q280 ${y + 21} 316 210`} />
          </g>
        ))}
      </g>
      <circle className="registry-ring" cx="376" cy="210" r="84" />
      <path
        className="shield"
        d="M376 157 417 175v36c0 30-18 52-41 64-23-12-41-34-41-64v-36l41-18Z"
      />
      <circle className="person" cx="376" cy="206" r="13" />
      <path className="person" d="M350 244c4-16 14-24 26-24s22 8 26 24" />
      <path
        className="classification-rail"
        d="M460 210h47m0-108v216m0-216h28m-28 72h28m-28 72h28m-28 72h28"
      />
      {[
        { y: 80, className: 'hard' },
        { y: 152, className: 'soft' },
        { y: 224, className: 'monitored' },
        { y: 296, className: 'unlisted' },
      ].map(({ y, className }) => (
        <g className="result-record" key={className}>
          <rect x="535" y={y} width="168" height="52" rx="6" />
          <circle className={className} cx="560" cy={y + 26} r="9" />
          <path d={`M582 ${y + 20}h88m-88 13h66`} />
        </g>
      ))}
    </svg>
  );
}

export function PublicApp() {
  const [query, setQuery] = useState('');
  const [phaseMessage, setPhaseMessage] = useState('');

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhaseMessage(getRegistrySearchMessage(query));
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <a className="public-brand" href="#explore" aria-label="Open Creator Registry home">
          <BrandMark />
          <span>Open Creator Registry</span>
        </a>
        <nav className="public-navigation" aria-label="Primary navigation">
          <a className="active" href="#explore">
            Explore
          </a>
          <a href="#check">Check a handle</a>
          <a href="#api">API</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <main className="public-main" id="explore">
        <section className="hero-copy" aria-labelledby="public-heading">
          <h1 id="public-heading">Know when a creator handle needs protection.</h1>
          <p className="hero-summary">
            Search the public registry or check a handle’s protection classification before your
            platform assigns it.
          </p>

          <form className="registry-search" id="check" onSubmit={handleSearch}>
            <label className="sr-only" htmlFor="registry-query">
              Search creators, aliases, or handles
            </label>
            <div className="search-input-wrap">
              <SearchIcon />
              <input
                id="registry-query"
                name="query"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search creators, aliases, or handles"
                maxLength={120}
              />
            </div>
            <button type="submit">Search registry</button>
          </form>

          <p className="phase-message" aria-live="polite">
            {phaseMessage}
          </p>

          <a
            className="api-link"
            id="api"
            href="/docs"
            aria-label="Read the interactive API documentation"
          >
            <span>Read the API docs</span>
            <ArrowIcon />
          </a>
        </section>

        <section className="hero-system" aria-label="Protection classifications">
          <RegistryIllustration />
          <div className="classification-key">
            {registryClassifications.map((classification) => (
              <div className="classification-item" key={classification}>
                <span className={`classification-dot ${classification}`} aria-hidden="true" />
                <span>{classificationLabels[classification]}</span>
              </div>
            ))}
          </div>
          <p className="registry-disclaimer" id="about">
            <span aria-hidden="true">i</span>
            Registry status is not proof of ownership, trademark rights, endorsement, or platform
            availability.
          </p>
        </section>
      </main>

      <footer className="public-footer">Open data. Versioned decisions. Transparent policy.</footer>
    </div>
  );
}
