import { argument, requireChoice, supportedEnvironments } from './configuration.mjs';

const environment = requireChoice(argument('environment'), supportedEnvironments, 'environment');
const publicUrl = process.env.PUBLIC_WORKER_URL;
const adminUrl = process.env.ADMIN_WORKER_URL;
if (!publicUrl || !adminUrl) {
  throw new Error('PUBLIC_WORKER_URL and ADMIN_WORKER_URL are required.');
}

async function check(label, url, options = {}, expected = [200]) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  if (!expected.includes(response.status)) {
    throw new Error(
      `${label} returned HTTP ${response.status}; expected ${expected.join(' or ')}.`,
    );
  }
  console.log(`${label}: HTTP ${response.status}`);
  return response;
}

await check('public health', `${publicUrl}/api/v1/health`);
await check('public home', `${publicUrl}/`);
await check(
  'public handle check',
  `${publicUrl}/api/v1/handles/check?handle=ordinary_unlisted_smoke`,
);
const creators = await check('public creator browse', `${publicUrl}/api/v1/creators?limit=1`);
const creatorsBody = await creators.json();
const creatorId = creatorsBody?.data?.[0]?.id;
if (creatorId) await check('public creator detail', `${publicUrl}/api/v1/creators/${creatorId}`);
await check('public OpenAPI', `${publicUrl}/openapi.json`);
await check('public documentation', `${publicUrl}/docs`);
await check('public 404', `${publicUrl}/api/v1/not-a-route`, {}, [404]);
await check('public/admin route separation', `${publicUrl}/api/admin/v1/dashboard`, {}, [404]);

await check('admin unauthenticated denial', `${adminUrl}/api/admin/v1/health`, {}, [302, 401, 403]);
const clientId = process.env.CF_ACCESS_CLIENT_ID;
const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  throw new Error(
    'CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are required for admin smoke tests.',
  );
}
const accessHeaders = {
  'CF-Access-Client-Id': clientId,
  'CF-Access-Client-Secret': clientSecret,
};
await check('admin shell through Access service policy', `${adminUrl}/`, {
  headers: accessHeaders,
});
await check(
  'admin application denies non-human service identity',
  `${adminUrl}/api/admin/v1/health`,
  { headers: accessHeaders },
  [401],
);
await check(
  'admin/public route separation',
  `${adminUrl}/api/v1/health`,
  { headers: accessHeaders },
  [404],
);
console.log(
  'Complete authenticated administration API and documentation checks in a human Access session.',
);
console.log(`${environment} HTTP smoke test passed.`);
