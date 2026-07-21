import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PublicApp } from './PublicApp';

describe('PublicApp', () => {
  it('states the protection purpose without claiming username availability', () => {
    const html = renderToStaticMarkup(<PublicApp />);

    expect(html).toContain('Know when a creator handle needs protection.');
    expect(html).toContain('platform availability');
    expect(html).not.toContain('username_available');
    expect(html).not.toContain('username is available');
  });

  it('renders all registry classifications', () => {
    const html = renderToStaticMarkup(<PublicApp />);

    expect(html).toContain('Hard reserved');
    expect(html).toContain('Soft protected');
    expect(html).toContain('Monitored');
    expect(html).toContain('Not listed');
  });

  it('does not route to API documentation before it is implemented', () => {
    const html = renderToStaticMarkup(<PublicApp />);

    expect(html).toContain('Check API documentation status');
    expect(html).not.toContain('href="/docs"');
  });
});
