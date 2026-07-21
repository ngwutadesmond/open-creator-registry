import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PublicApp } from './PublicApp';
import { jsonResponse, registryMeta } from './test/fixtures';

describe('PublicApp', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(registryMeta)),
    );
  });

  it('explains the Registry boundary and renders public-only navigation', async () => {
    render(<PublicApp />);

    expect(
      await screen.findByRole('heading', { name: 'Know when a creator handle needs protection.' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not an availability service/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/creators');
    expect(screen.queryByRole('link', { name: /admin/i })).not.toBeInTheDocument();
    expect(await screen.findByText(/local demonstration data only/i)).toBeInTheDocument();
  });

  it('validates the home checker and navigates deliberate submissions', async () => {
    const user = userEvent.setup();
    render(<PublicApp />);

    await user.click(screen.getByRole('button', { name: 'Check protection status' }));
    expect(screen.getByText('Enter a username or handle to check.')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Username or handle' }), 'ordinary_name');
    await user.click(screen.getByRole('button', { name: 'Check protection status' }));
    expect(
      await screen.findByRole('heading', { name: 'Check a handle’s protection status.' }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('?handle=ordinary_name');
  });

  it('opens and closes the keyboard-accessible mobile navigation', async () => {
    const user = userEvent.setup();
    render(<PublicApp />);

    const menu = screen.getByRole('button', { name: 'Menu' });
    await user.click(menu);
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('navigation', { name: 'Mobile navigation' })).not.toBeInTheDocument();
  });
});
