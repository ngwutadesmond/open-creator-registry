import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AdminRuntimeBindings } from './app-env';
import { CloudflareAccessAuthenticationProvider } from './cloudflare-access';

const issuer = 'https://registry-test.cloudflareaccess.com';
const audience = 'test-access-audience';
const administratorEmail = 'administrator@example.test';
const baseBindings = {
  DB: {} as D1Database,
  ENVIRONMENT: 'production',
  AUTH_PROVIDER: 'cloudflare_access',
  ADMIN_ALLOWED_ORIGINS: 'https://admin.example.test',
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: issuer,
  CLOUDFLARE_ACCESS_AUD: audience,
  ADMIN_ALLOWED_EMAILS: administratorEmail,
  ADMIN_ROLE_MAPPINGS: JSON.stringify({
    [administratorEmail]: ['editor', 'admin_viewer'],
  }),
} satisfies AdminRuntimeBindings;

type TestJwk = JsonWebKey & { kid: string; use: string; alg: string };

let primaryPrivateKey: CryptoKey;
let primaryJwk: TestJwk;
let rotatedPrivateKey: CryptoKey;
let rotatedJwk: TestJwk;

beforeAll(async () => {
  const primary = await generateKeyPair('RS256');
  primaryPrivateKey = primary.privateKey;
  primaryJwk = {
    ...(await exportJWK(primary.publicKey)),
    kid: 'primary',
    use: 'sig',
    alg: 'RS256',
  };
  const rotated = await generateKeyPair('RS256');
  rotatedPrivateKey = rotated.privateKey;
  rotatedJwk = {
    ...(await exportJWK(rotated.publicKey)),
    kid: 'rotated',
    use: 'sig',
    alg: 'RS256',
  };
});

function jwksFetch(keys: JsonWebKey[]) {
  return vi.fn(() => Promise.resolve(Response.json({ keys })));
}

async function token(
  input: {
    key?: CryptoKey;
    kid?: string;
    issuer?: string;
    audience?: string;
    email?: string | null;
    expiresIn?: number;
    notBefore?: number;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    sub: 'access-subject-1',
    name: 'Registry Administrator',
    ...(input.email === null ? {} : { email: input.email ?? administratorEmail }),
  };
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: input.kid ?? 'primary' })
    .setIssuer(input.issuer ?? issuer)
    .setAudience(input.audience ?? audience)
    .setIssuedAt(now)
    .setNotBefore(input.notBefore ?? now - 1)
    .setExpirationTime(now + (input.expiresIn ?? 300))
    .sign(input.key ?? primaryPrivateKey);
}

function request(assertion?: string) {
  return new Request('https://admin.example.test/api/admin/v1/me', {
    headers: assertion ? { 'Cf-Access-Jwt-Assertion': assertion } : {},
  });
}

function provider(fetch = jwksFetch([primaryJwk])) {
  return {
    fetch,
    provider: new CloudflareAccessAuthenticationProvider({
      fetch,
      cooldownDuration: 0,
      cacheMaxAge: 60_000,
    }),
  };
}

async function expectRequired(promise: Promise<unknown>) {
  await expect(promise).rejects.toMatchObject({
    code: 'authentication_required',
  });
}

describe('Cloudflare Access JWT authentication', () => {
  it('cryptographically validates a valid JWT and maps identity roles', async () => {
    const { provider: access } = provider();
    const identity = await access.authenticate(request(await token()), baseBindings);
    expect(identity).toMatchObject({
      subject: 'access-subject-1',
      email: administratorEmail,
      displayName: 'Registry Administrator',
      roles: ['editor', 'admin_viewer'],
      authenticationSource: 'cloudflare_access',
    });
    expect(identity.permissions).toContain('creators:write');
  });

  it('rejects a missing or malformed JWT', async () => {
    const { provider: access } = provider();
    await expectRequired(access.authenticate(request(), baseBindings));
    await expectRequired(access.authenticate(request('not-a-jwt'), baseBindings));
  });

  it('rejects expired and not-yet-valid JWTs', async () => {
    const { provider: access } = provider();
    await expectRequired(
      access.authenticate(request(await token({ expiresIn: -10 })), baseBindings),
    );
    await expectRequired(
      access.authenticate(
        request(await token({ notBefore: Math.floor(Date.now() / 1000) + 60 })),
        baseBindings,
      ),
    );
  });

  it('rejects incorrect issuer and audience values', async () => {
    const { provider: access } = provider();
    await expectRequired(
      access.authenticate(
        request(await token({ issuer: 'https://other.cloudflareaccess.com' })),
        baseBindings,
      ),
    );
    await expectRequired(
      access.authenticate(request(await token({ audience: 'wrong-audience' })), baseBindings),
    );
  });

  it('rejects an unknown key ID and an invalid signature', async () => {
    const { provider: access } = provider();
    await expectRequired(
      access.authenticate(request(await token({ kid: 'unknown' })), baseBindings),
    );
    await expectRequired(
      access.authenticate(
        request(await token({ key: rotatedPrivateKey, kid: 'primary' })),
        baseBindings,
      ),
    );
  });

  it('rejects missing email and disallowed administrators', async () => {
    const { provider: access } = provider();
    await expectRequired(access.authenticate(request(await token({ email: null })), baseBindings));
    await expectRequired(
      access.authenticate(request(await token({ email: 'outsider@example.test' })), baseBindings),
    );
  });

  it('refreshes cached keys when a signing key rotates', async () => {
    let calls = 0;
    const fetch = vi.fn(() => {
      calls += 1;
      return Promise.resolve(
        Response.json({ keys: calls === 1 ? [primaryJwk] : [primaryJwk, rotatedJwk] }),
      );
    });
    const access = new CloudflareAccessAuthenticationProvider({
      fetch,
      cooldownDuration: 0,
      cacheMaxAge: 60_000,
    });
    await access.authenticate(request(await token()), baseBindings);
    await access.authenticate(
      request(await token({ key: rotatedPrivateKey, kid: 'rotated' })),
      baseBindings,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reuses a conservatively cached JWK set', async () => {
    const { provider: access, fetch } = provider();
    await access.authenticate(request(await token()), baseBindings);
    await access.authenticate(request(await token()), baseBindings);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Access configuration or role mapping is missing', async () => {
    const { provider: access } = provider();
    await expect(
      access.authenticate(request(await token()), {
        ...baseBindings,
        CLOUDFLARE_ACCESS_AUD: undefined,
      }),
    ).rejects.toMatchObject({ code: 'authentication_unavailable' });
    await expect(
      access.authenticate(request(await token()), {
        ...baseBindings,
        ADMIN_ROLE_MAPPINGS: JSON.stringify({}),
      }),
    ).rejects.toMatchObject({ code: 'authentication_unavailable' });
  });

  it('does not log JWT material during authentication failure', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const assertion = await token({ key: rotatedPrivateKey, kid: 'primary' });
    const { provider: access } = provider();
    await expectRequired(access.authenticate(request(assertion), baseBindings));
    expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(assertion);
    spy.mockRestore();
  });
});
