import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router';

import { BrandMark } from '../components/BrandMark';
import { CloseIcon, MenuIcon } from '../components/Icons';

const navigation = [
  { label: 'Explore', to: '/creators' },
  { label: 'Check a handle', to: '/check' },
  { label: 'Releases', to: '/releases' },
  { label: 'API tester', to: '/api-tester' },
  { label: 'About', to: '/about' },
] as const;

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  return navigation.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) => (isActive ? 'active' : undefined)}
    >
      {item.label}
    </NavLink>
  ));
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLElement | null>(null);

  function openMobileNavigation() {
    setMobileOpen(true);
    window.requestAnimationFrame(() => firstMobileLinkRef.current?.focus());
  }

  function closeMobileNavigation(returnFocus = false) {
    setMobileOpen(false);
    if (returnFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function handleMobileKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') closeMobileNavigation(true);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') closeMobileNavigation(true);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);

  return (
    <div className="public-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="public-header">
        <NavLink className="public-brand" to="/" aria-label="Open Creator Registry home">
          <BrandMark />
          <span>Open Creator Registry</span>
        </NavLink>
        <nav className="public-navigation desktop-navigation" aria-label="Primary navigation">
          <NavigationLinks />
          <a href="/docs">API docs</a>
        </nav>
        <button
          className="mobile-menu-button"
          ref={menuButtonRef}
          type="button"
          aria-controls="mobile-navigation"
          aria-expanded={mobileOpen}
          onClick={mobileOpen ? () => closeMobileNavigation() : openMobileNavigation}
        >
          {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          <span>{mobileOpen ? 'Close menu' : 'Menu'}</span>
        </button>
      </header>
      {mobileOpen ? (
        <nav
          className="mobile-navigation"
          id="mobile-navigation"
          aria-label="Mobile navigation"
          onKeyDown={handleMobileKeyDown}
          ref={(node) => {
            firstMobileLinkRef.current = node?.querySelector('a') ?? null;
          }}
        >
          <NavigationLinks onNavigate={() => closeMobileNavigation()} />
          <a href="/docs" onClick={() => closeMobileNavigation()}>
            API docs
          </a>
        </nav>
      ) : null}
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="public-footer">
        <p>Open data. Versioned decisions. Transparent policy.</p>
        <nav aria-label="Footer navigation">
          <NavLink to="/submit">Submit a creator</NavLink>
          <NavLink to="/about">Registry policy</NavLink>
          <a href="/docs">API documentation</a>
        </nav>
      </footer>
    </div>
  );
}
