# Changelog

All notable changes to this project are documented here. The project follows semantic versioning
after its first public release.

## Unreleased

### Added

- Phase 1 npm-workspaces foundation.
- Separate public and administration React/Vite/Hono application shells.
- Shared domain-contract and design-token packages.
- Architecture, implementation-plan, local-development, and future-agent documentation.

### Verified

- Public and administration production builds run through the Cloudflare Vite plugin.
- Public search-shell feedback, admin architecture disclosure, desktop sidebar collapse, and mobile
  navigation behavior were exercised in the in-app browser.
- Both Worker boundaries return explicit `501 not_implemented` envelopes until their scheduled API
  phases, instead of exposing fabricated data.
