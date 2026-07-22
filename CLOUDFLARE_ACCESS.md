# Cloudflare Access configuration

The complete administration hostname must be protected by Cloudflare Access. Access is the outer
identity-aware proxy; the Worker independently validates the `Cf-Access-Jwt-Assertion` signature,
RS256 algorithm, issuer, audience, expiry/not-before claims, verified email, server-side allowlist,
and server-side role mapping. Either layer denying access is sufficient. CORS is not authentication.

## Create the staging application

After the staging admin Worker has a URL, an authorised operator must:

1. Open Cloudflare Dashboard, then **Zero Trust → Access controls → Applications**.
2. Select **Create new application → Self-hosted and private → Add public hostname**.
3. Enter the complete administration hostname with no path so every page, asset, API, and docs
   route is protected. Do not protect only `/api`.
4. Create an **Allow** policy that includes only named administrator emails (or a tightly governed
   IdP group). Do not use `Everyone`, broad email domains, or `Bypass`.
5. Require the intended identity provider and, where available, MFA/device posture. Keep the
   shortest operationally practical session duration.
6. Create a separate **Service Auth** policy for the short-lived staging smoke token. Restrict it to
   that exact token and, where stable, the operator/CI source IP. This token reaches the shell but
   is intentionally not an application administrator.
7. Create the application, open **Additional settings**, and copy its Application Audience (AUD)
   tag. Record the team domain and AUD outside Git.
8. Replace the staging team-domain/AUD placeholders in the local admin Wrangler config. Upload
   `ADMIN_ALLOWED_EMAILS` and `ADMIN_ROLE_MAPPINGS` as Worker secrets.
9. Deploy/redeploy the admin Worker, then verify an unauthenticated request is denied by Access and
   an allowed human session reaches the Worker.

Repeat with a distinct Access application, audience, policies, and administrator review for
production. Never reuse the staging AUD.

## Secret formats

`ADMIN_ALLOWED_EMAILS` is a comma-separated, lowercase email allowlist. `ADMIN_ROLE_MAPPINGS` is a
JSON object whose keys are the same emails and values are non-empty arrays containing only
`admin_viewer`, `reviewer`, `editor`, `publisher`, or `super_admin`. Give each person the minimum
roles required. Two-person approval still requires different authenticated subjects.

## Deterministic validation coverage

Local tests generate ephemeral RSA key pairs and JWTs. They prove a valid identity, issuer,
audience, signature, expiry/not-before, unknown key, bad signature, missing email, disallowed email,
role mapping, JWK caching, key rotation, missing configuration, and no token logging. Tests never
use a real Access token or network call.

Cloudflare recommends validating the `Cf-Access-Jwt-Assertion` header rather than trusting the
cookie, and publishes rotating keys at
`https://TEAM.cloudflareaccess.com/cdn-cgi/access/certs`. See
[Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
and [Access policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).
