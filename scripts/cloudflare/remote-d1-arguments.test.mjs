import { describe, expect, it } from 'vitest';

import { remoteDatabaseArguments, timeTravelInfoArguments } from './remote-d1-arguments.mjs';

const input = {
  databaseName: 'open-creator-registry-staging',
  manifestPath: '/ignored/staging/wrangler.json',
};

describe('remote D1 Wrangler arguments', () => {
  it('marks migrations and SQL execution as remote', () => {
    expect(remoteDatabaseArguments(input)).toEqual([
      'open-creator-registry-staging',
      '--remote',
      '--config',
      '/ignored/staging/wrangler.json',
    ]);
  });

  it('does not pass the unsupported remote flag to Time Travel info', () => {
    expect(timeTravelInfoArguments(input)).toEqual([
      'open-creator-registry-staging',
      '--config',
      '/ignored/staging/wrangler.json',
    ]);
  });
});
