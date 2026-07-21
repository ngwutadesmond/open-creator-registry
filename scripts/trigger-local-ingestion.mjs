const endpoint = process.env.INGESTION_SCHEDULED_URL ?? 'http://localhost:8788/__scheduled';

let response;
try {
  response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
} catch (error) {
  throw new Error(
    'The local scheduled Worker is not reachable. Start `npm run ingestion:serve:local` in another terminal first.',
    { cause: error },
  );
}

if (!response.ok) {
  throw new Error(`The local scheduled trigger returned HTTP ${response.status}.`);
}

console.log(
  'Local scheduled ingestion trigger completed. Inspect /ingestion-runs in the admin app.',
);
