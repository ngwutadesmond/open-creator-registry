import { Hono } from 'hono';

import type { DatabaseBinding } from '@open-creator-registry/database/binding';

const app = new Hono<{ Bindings: DatabaseBinding }>();

app.all('/api/*', (context) =>
  context.json(
    {
      data: null,
      error: {
        code: 'not_implemented',
        message: 'The versioned public API is delivered in Phase 3.',
      },
      meta: {
        request_id: crypto.randomUUID(),
      },
    },
    501,
  ),
);

export default app;
