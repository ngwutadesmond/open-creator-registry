import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AdminApp } from './AdminApp';

describe('AdminApp', () => {
  it('identifies the private deployment boundary and Access requirement', () => {
    const html = renderToStaticMarkup(<AdminApp />);

    expect(html).toContain('Registry administration');
    expect(html).toContain('Protect this Worker with Cloudflare Access before deployment.');
    expect(html).toContain('Private application');
  });

  it('does not invent database metrics before Phase 5 connects the interface', () => {
    const html = renderToStaticMarkup(<AdminApp />);

    expect(html).toContain(
      'Database-backed metrics and review queues will be connected in Phase 5',
    );
    expect(html).not.toContain('Total creators');
    expect(html).not.toContain('Recent activity');
  });

  it('marks future administration sections as unavailable until Phase 5', () => {
    const html = renderToStaticMarkup(<AdminApp />);

    expect(html).toContain('Creators, available in Phase 5');
    expect(html).not.toContain('href="#creators"');
  });
});
