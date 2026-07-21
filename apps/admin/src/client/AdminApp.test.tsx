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

  it('does not invent database metrics before the repository layer exists', () => {
    const html = renderToStaticMarkup(<AdminApp />);

    expect(html).toContain('Database-backed metrics and review queues will appear');
    expect(html).not.toContain('Total creators');
    expect(html).not.toContain('Recent activity');
  });
});
