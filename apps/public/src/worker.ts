import { Hono } from 'hono';

const app = new Hono();

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
