# Administration frontend

The private React application uses `react-router`, lazy route modules, one Zod-validating fetch
client, and the Phase 1 shared visual tokens. SQL and direct D1 access never appear in React.

## Routes

- `/` dashboard
- `/creators`, `/creators/new`, `/creators/:creatorId`
- `/handles`, `/handles/new`, `/handles/:handleId`
- `/candidates`, `/candidates/:recordId`
- `/submissions`, `/submissions/:recordId`
- `/imports`, `/imports/:recordId`
- `/ingestion-runs`, `/ingestion-runs/:recordId`
- `/releases`, `/releases/:recordId`
- `/approvals`, `/approvals/:recordId`
- `/audit-logs`, `/audit-logs/:recordId`
- `/settings`

Routes support direct loading and refresh. The shell has desktop collapse and an Escape-dismissable
mobile drawer. Tables are labelled scroll regions on narrow displays. Forms preserve server errors
and expose validation constraints; destructive and sensitive actions require confirmation. The
client displays request IDs for supportable failures.

The identity provider loads `/me`; page actions may be hidden or disabled from returned
permissions, while API authorization remains authoritative. There is no token or role state in
`localStorage`.

Loading, empty, error, success, confirmation, common-name, confusable, demonstration-data, and
approval states are explicit. WCAG A/2.1 A automation runs in Playwright, with keyboard focus,
Escape behavior, reduced motion, labelled controls, and responsive overflow covered.

## Phase 5 visual-fidelity ledger

| Surface                      | Accepted direction                                                              | Rendered result                                                                                                                      | Finding or intentional deviation                                                  |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Dashboard                    | Restrained navy, white, and emerald operational shell                           | Real D1 metrics, review queues, and recent activity use the accepted shell                                                           | Concept placeholders were replaced with real local demonstration data             |
| Creator evidence             | Dense but readable creator, alias, source, handle, approval, and history panels | Labels, normalized signals, evidence provenance, and editable forms remain visible without page overflow                             | Wide evidence tables become labelled horizontal scroll regions at narrow widths   |
| Handle reservation           | Risk-first form with clear review consequences                                  | Live normalized handle, confusable skeleton, conflicts, associated creator, and second-approval requirement appear before submission | No material deviation                                                             |
| Imports, releases, and audit | Operational forms and paginated queue tables                                    | Explicit dry-run/commit summaries, release approvals, audit filters, and record details                                              | Narrow tables scroll within their own regions rather than compressing identifiers |
| Responsive navigation        | Persistent desktop sidebar and compact mobile drawer                            | Desktop and tablet preserve hierarchy; mobile drawer traps navigation focus and restores it on close                                 | No material deviation                                                             |

Real Chromium checks cover 1536×1024, 1280×800, 1024×768, 768×1024, 390×844, and 320×844.
Manual screenshots included the dashboard, creator evidence, reservation conflict preview, imports,
releases, public home, and public handle checker. Browser-console monitoring and document-overflow
assertions found no material mismatch. The intentionally scrollable narrow tables are not page
overflow.

Run UI checks with:

```bash
npm run test:frontend
npm run test:e2e
npm run dev:admin
```

The creator detail page now manages optional platform profiles, visibility, verification,
provenance, and retained suppression inside the Phase 5 design system. The ingestion page extends
the existing operations area with disabled-by-default source configuration, bounded preview/run,
checkpoint status/reset confirmation, run counters, and per-record candidate links. Candidate
detail displays source licence, mapping/connector versions, aliases, profile evidence, match
recommendation, retrieval time, and checksum without exposing raw responses.
