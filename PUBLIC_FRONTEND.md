# Public frontend

## Purpose and boundary

The React application in `apps/public/src/client` is the public interface to the Phase 3 API. It
classifies protection and presents reviewed Registry evidence. It never decides whether a username
is available, proves identity or ownership, approves a claim, or exposes administration features.

## Routes

| Route                  | Purpose                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| `/`                    | Registry explanation, live metadata, and handle-check entry            |
| `/check`               | Deliberate single-handle check with classification and platform action |
| `/creators`            | Server-paginated creator search, filters, and safe sorting             |
| `/creators/:creatorId` | Public creator, alias, source, and active-handle evidence              |
| `/releases`            | Current Registry state and published release history                   |
| `/submit`              | Pending public-evidence proposal                                       |
| `/api-tester`          | Allowlisted public GET request tester                                  |
| `/about`               | Classification, platform-flow, and public data-source policy           |
| `/docs`                | Phase 3 generated Scalar API documentation                             |

Unknown client routes render a public 404 state. Vite/Workers static-asset fallback supports direct
entry and refresh for frontend routes without intercepting `/api`, `/openapi.json`, or `/docs`.

## Client architecture

- `PublicApp.tsx` owns route composition and lazy route boundaries.
- `app/AppShell.tsx` owns public-only navigation, mobile navigation, and the page landmark shell.
- `api/public-api-client.ts` is the only browser HTTP client. It validates every successful and
  error envelope with Zod, propagates request IDs, and maps network/format errors into stable
  `PublicApiError` values.
- `hooks/useAsyncResource.ts` owns abortable GET loading, error, and retry state. URL parameters own
  explorer search/filter/history state.
- Focused page and component modules own presentation. React components contain no SQL and no
  hardcoded API results.

The explorer sends filters, allowlisted sort values, page, and limit to D1-backed endpoints. It does
not fetch the complete Registry for browser-side filtering. Creator detail starts its creator,
handle, and alias requests together and keeps the main record usable when a secondary section fails.

## Handle and submission behavior

Handle checks occur only on deliberate submission. The shared normalization package validates the
input before the API call; the API remains authoritative. Technical match types are translated into
public language, ambiguous matches suppress creator attribution, and confusable matches are labelled
as review signals rather than identity proof. `not_listed` uses neutral styling and always instructs
the consuming platform to perform its own availability and abuse checks.

The public submission form sends only fields supported by the Phase 3 contract. Failed submissions
preserve entered data; pending requests disable repeat submission. A success acknowledgement says
that the proposal remains pending and has not approved a creator or reserved a handle. No form data
is written to local storage or logged to the browser console.

## Visual fidelity ledger

The accepted Phase 1 public shell was the primary design source. Temporary screenshots were captured
outside the repository, inspected with image tooling, and removed after QA.

| Compared surface                      | Expected design evidence                                                                       | Rendered evidence                                 | Mismatch found                                                  | Fix applied                                                                                    | Intentional deviation                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home, 1536×1024                       | Open two-column editorial hero, ink/emerald palette, registry illustration, classification key | Phase 4 home at 1536×1024                         | None material                                                   | Preserved the accepted tokens, typography, spacing, illustration, and open composition         | Added real metadata and a working checker below/within the established composition                            |
| Checker, 1280×800                     | Strong editorial heading, ruled content, clear classification color plus text                  | Hard-reserved real D1 result at 1280×800          | Initial Strict Mode request was cancelled without a replacement | Separated URL synchronization from the stable data-fetch callback; added real-browser coverage | Result content extends below the first viewport because all required evidence remains visible without a modal |
| Explorer, 1280×800                    | Restrained form controls and rule-based hierarchy rather than card-heavy UI                    | Search/filter surface and live counts at 1280×800 | None material                                                   | Reused the design tokens and server-backed URL controls                                        | Result list begins below the filter area on laptop view to preserve usable controls                           |
| Creator detail, 1536×1024             | Editorial identity treatment and evidence arranged in readable ruled sections                  | Demo Aurora Vale record at 1536×1024              | None material                                                   | Parallel data loading and responsive section layouts use the accepted visual language          | Public-safe evidence replaces decorative placeholder data                                                     |
| Releases/API, 768×1024                | Same typography and spacing at tablet width                                                    | Unversioned release and API tester at 768×1024    | None material                                                   | Single-column tablet layouts preserve hierarchy and readable response areas                    | Local seed is truthfully shown as unversioned instead of inventing a release card                             |
| Submission/mobile navigation, 390×844 | Usable forms and compact public header                                                         | Submission at 390×844                             | None material                                                   | Responsive field stacks and focusable icon navigation                                          | Menu label becomes visually hidden below 400px while retaining its accessible name                            |
| Explorer, 320×844                     | No clipping or horizontal scroll                                                               | Ghana filter at 320×844                           | Header measured 347px before correction                         | Reduced narrow-header gap and visually hid the redundant visible menu label                    | None                                                                                                          |
| Admin boundary, 1536×1024 and 390×844 | Separate operational shell with Phase 5 boundary                                               | Existing admin shell inspected at desktop/mobile  | None                                                            | No Phase 4 admin code was added                                                                | Administration remains deliberately non-functional and its API remains `501`                                  |

## Testing

```bash
npm run test:frontend
npm run test:e2e
```

`test:frontend` runs jsdom component tests through the real typed API client with deterministic
responses. `test:e2e` resets the local D1 database, starts the public Worker and separate admin
shell, then runs Chromium against real HTTP and seeded data. Browser tests do not call public network
creator services. Scalar's pinned browser bundle is the only existing documentation dependency.
Creator detail conditionally renders “Official and associated profiles” only when reviewed public
records exist. Each safe HTTPS link opens with `noopener noreferrer`; status copy distinguishes a
source association from manual, cross-source, or creator-control verification. Creators without
profiles retain the existing detail layout without empty platform placeholders.
