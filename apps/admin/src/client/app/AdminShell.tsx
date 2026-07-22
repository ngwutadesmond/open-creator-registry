import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import { useAdminIdentity } from './AdminIdentityContext';

const navigation = [
  ['Dashboard', '/', 'dashboard'],
  ['Creators', '/creators', 'person'],
  ['Reserved handles', '/handles', 'shield'],
  ['Candidates', '/candidates', 'group'],
  ['Submissions', '/submissions', 'document'],
  ['Imports', '/imports', 'import'],
  ['Ingestion runs', '/ingestion-runs', 'runs'],
  ['Registry releases', '/releases', 'tag'],
  ['Approvals', '/approvals', 'approval'],
  ['Audit logs', '/audit-logs', 'log'],
  ['Settings', '/settings', 'settings'],
] as const;

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

function NavIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    dashboard: 'M4 11 12 4l8 7v9H4v-9Z M9 20v-6h6v6',
    person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M5 21c.8-4.4 3.1-6.6 7-6.6s6.2 2.2 7 6.6',
    shield: 'm12 3 7 3v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z',
    group:
      'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M3 21c.6-4.4 2.6-6.5 6-6.5s5.4 2.1 6 6.5 M16 5c2 .4 2.7 3.6 1 5 M17 15c2.4.7 3.6 2.7 4 6',
    document: 'M6 3h8l4 4v14H6V3Z M14 3v5h4 M9 12h6 M9 16h6',
    import: 'M12 3v13 M7 8l5-5 5 5 M5 14v7h14v-7',
    runs: 'M20 8A8 8 0 0 0 5.5 6 M4 4v5h5 M4 16a8 8 0 0 0 14.5 2 M20 20v-5h-5',
    tag: 'M3 7V3h7l11 11-7 7L3 10V7Z M7.5 7.5h.1',
    approval: 'M6 12 10 16 18 7 M12 22C7 20 4 17 4 12V6l8-3 8 3v6c0 5-3 8-8 10Z',
    log: 'M6 3h12v18H6V3Z M9 8h6 M9 12h6 M9 16h4',
    settings:
      'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6 7 7 M17 17l1.4 1.4 M18.4 5.6 17 7 M7 17l-1.4 1.4',
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
      <path
        d={paths[type]}
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AdminShell() {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const location = useLocation();
  const { identity } = useAdminIdentity();
  const usesCloudflareAccess = identity.authentication_source === 'cloudflare_access';

  useEffect(() => {
    if (!navigationOpen) return;
    firstLink.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavigationOpen(false);
        mobileToggle.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [navigationOpen]);

  return (
    <div
      className={`admin-shell${collapsed ? ' navigation-collapsed' : ''}${navigationOpen ? ' mobile-navigation-open' : ''}`}
    >
      <header className="admin-header">
        <button
          className="menu-button desktop-navigation-toggle"
          type="button"
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          aria-controls="admin-navigation"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <MenuIcon />
        </button>
        <button
          ref={mobileToggle}
          className="menu-button mobile-navigation-toggle"
          type="button"
          aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
          aria-controls="admin-navigation"
          aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen((value) => !value)}
        >
          <MenuIcon />
        </button>
        <div className="admin-brand">
          <strong>Open Creator Registry</strong>
          <span aria-hidden="true" />
          <p>Administration</p>
        </div>
        <div className="current-admin" aria-label="Current administrator">
          <span>{identity.display_name}</span>
          <small>{identity.roles.join(' · ')}</small>
        </div>
      </header>
      <aside className="admin-sidebar" id="admin-navigation">
        <nav aria-label="Administration navigation">
          {navigation.map(([label, href, icon], index) => (
            <NavLink
              ref={index === 0 ? firstLink : undefined}
              className={({ isActive }) =>
                `admin-nav-item${isActive && (href !== '/' || location.pathname === '/') ? ' selected' : ''}`
              }
              to={href}
              end={href === '/'}
              key={href}
              onClick={() => setNavigationOpen(false)}
            >
              <NavIcon type={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <p className="private-label">Private application · No public navigation</p>
      </aside>
      <main className="admin-main" id="main-content">
        <div className="local-auth-notice" role="note">
          {usesCloudflareAccess ? (
            <>
              <strong>Cloudflare Access identity:</strong> {identity.email}. The Worker verified the
              Access assertion and applied its server-side role mapping.
            </>
          ) : (
            <>
              <strong>Local development identity:</strong> {identity.email}. Remote environments
              remain denied until Cloudflare Access JWT verification is configured.
            </>
          )}
        </div>
        <Outlet />
        <footer className="admin-status">
          <NavIcon type="shield" />
          <span>Private application · Environment-scoped Registry data</span>
        </footer>
      </main>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        onClick={() => {
          setNavigationOpen(false);
          mobileToggle.current?.focus();
        }}
      />
    </div>
  );
}
