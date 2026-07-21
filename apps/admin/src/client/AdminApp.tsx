import { useState } from 'react';

type NavigationItem = {
  label: string;
  icon:
    'dashboard' | 'person' | 'shield' | 'group' | 'document' | 'import' | 'runs' | 'tag' | 'log';
};

const navigationItems: NavigationItem[] = [
  { label: 'Dashboard', icon: 'dashboard' },
  { label: 'Creators', icon: 'person' },
  { label: 'Reserved handles', icon: 'shield' },
  { label: 'Candidates', icon: 'group' },
  { label: 'Submissions', icon: 'document' },
  { label: 'Imports', icon: 'import' },
  { label: 'Ingestion runs', icon: 'runs' },
  { label: 'Registry releases', icon: 'tag' },
  { label: 'Audit logs', icon: 'log' },
];

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIcon({ type }: { type: NavigationItem['icon'] }) {
  if (type === 'dashboard') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="m3 11 9-7 9 7v9H3v-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 20v-6h6v6" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (type === 'person') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 21c.7-4.3 3-6.5 7-6.5s6.3 2.2 7 6.5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === 'shield') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="m12 3 7 3v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === 'group') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M3 20c.5-4 2.5-6 6-6s5.5 2 6 6M16 5.5c2.2.5 3.2 3.6 1.5 5.2M17 14c2.6.7 3.8 2.7 4 6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === 'document' || type === 'log') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="M6 3h8l4 4v14H6V3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M14 3v5h4M9 12h6M9 16h6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === 'import') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3v13m0-13L7 8m5-5 5 5M5 14v7h14v-7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === 'runs') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
        <path
          d="M20 8a8 8 0 0 0-14.5-2M4 4v5h5M4 16a8 8 0 0 0 14.5 2M20 20v-5h-5"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 7V3h7l11 11-7 7L3 10V7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3 2.8 20h18.4L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M12 9v5m0 3v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WorkspaceIllustration() {
  return (
    <svg
      className="workspace-illustration"
      viewBox="0 0 280 180"
      role="img"
      aria-label="A registry document protected by a shield"
    >
      <path className="document" d="M72 18h96l36 36v94H72V18Z" />
      <path className="fold" d="M168 18v36h36" />
      <path className="line" d="M98 62h58M98 82h74M98 102h44" />
      <circle className="shield-ring" cx="181" cy="120" r="48" />
      <path className="shield" d="m181 91 23 10v20c0 17-10 29-23 36-13-7-23-19-23-36v-20l23-10Z" />
      <path className="check" d="m170 122 8 8 16-19" />
      <path className="base-line" d="M34 168h212" />
    </svg>
  );
}

export function AdminApp() {
  const [navigationToggled, setNavigationToggled] = useState(false);
  const [architectureOpen, setArchitectureOpen] = useState(false);

  return (
    <div className={`admin-shell${navigationToggled ? ' navigation-toggled' : ''}`}>
      <header className="admin-header">
        <button
          className="menu-button"
          type="button"
          aria-label="Toggle navigation"
          aria-controls="admin-navigation"
          onClick={() => setNavigationToggled((current) => !current)}
        >
          <MenuIcon />
        </button>
        <div className="admin-brand">
          <strong>Open Creator Registry</strong>
          <span aria-hidden="true" />
          <p>Administration</p>
        </div>
      </header>

      <aside className="admin-sidebar" id="admin-navigation" aria-label="Administration navigation">
        <nav>
          {navigationItems.map((item, index) => (
            <a
              className={index === 0 ? 'selected' : undefined}
              href={
                index === 0 ? '#dashboard' : `#${item.label.toLowerCase().replaceAll(' ', '-')}`
              }
              aria-current={index === 0 ? 'page' : undefined}
              key={item.label}
              onClick={() => setNavigationToggled(false)}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <p className="private-label">Private application · No public navigation</p>
      </aside>

      <main className="admin-main" id="dashboard">
        <div className="admin-heading">
          <h1>Registry administration</h1>
          <p>Manage registry records, review evidence, and publish versioned releases.</p>
        </div>

        <div className="access-notice" role="note">
          <WarningIcon />
          <strong>Protect this Worker with Cloudflare Access before deployment.</strong>
        </div>

        <section className="workspace-state" aria-labelledby="workspace-heading">
          <WorkspaceIllustration />
          <h2 id="workspace-heading">Administration workspace ready</h2>
          <p>
            Database-backed metrics and review queues will appear after the D1 repository layer is
            connected.
          </p>
          <button
            type="button"
            aria-expanded={architectureOpen}
            aria-controls="architecture-summary"
            onClick={() => setArchitectureOpen((current) => !current)}
          >
            {architectureOpen ? 'Hide architecture' : 'View architecture'}
            <span aria-hidden="true">→</span>
          </button>
          {architectureOpen ? (
            <div className="architecture-summary" id="architecture-summary">
              Public and administration interfaces deploy as separate Workers. Both will use the
              same D1 database, while Cloudflare Access protects this entire administration Worker.
            </div>
          ) : null}
        </section>

        <footer className="admin-status">
          <NavIcon type="shield" />
          <span>Private application · No public navigation</span>
        </footer>
      </main>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        onClick={() => setNavigationToggled(false)}
      />
    </div>
  );
}
