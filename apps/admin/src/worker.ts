import { Hono } from 'hono';

const app = new Hono();

app.all('/api/admin/*', (context) =>
  context.json(
    {
      data: null,
      error: {
        code: 'not_implemented',
        message: 'The private administration API is delivered in Phase 5.',
      },
      meta: {
        request_id: crypto.randomUUID(),
      },
    },
    501,
  ),
);

export default app;
