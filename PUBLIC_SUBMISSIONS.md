# Public creator submissions

## Review boundary

The public submission workflow creates pending suggestions for the existing administration
Submissions queue. It never approves a creator, creates a candidate, reserves or protects a
username, publishes a Registry release, or proves identity or ownership. Administration imports
are a separate authenticated workflow that can create controlled Registry records; the public
single and spreadsheet workflows do not call or reuse that endpoint.

The `/submit` page defaults to **Submit one creator**. **Upload spreadsheet** can also be opened at
`/submit?mode=bulk`. Switching modes preserves both in-progress browser drafts for the lifetime of
the page. Neither mode stores form or spreadsheet data in local storage.

## Spreadsheet formats and retention

The browser accepts `.csv` and non-macro `.xlsx` files up to 2 MiB and 250 non-empty creator rows.
It rejects `.xls`, `.xlsm`, `.ods`, macro-enabled, password-protected, malformed, and hidden-only
workbooks. CSV must be valid UTF-8. Formula cells in imported columns are rejected and formulas are
never evaluated. Spreadsheet values are rendered as text, never HTML.

CSV parsing uses the browser-compatible `papaparse` package. XLSX reading uses `read-excel-file`,
safe ZIP/XML inspection uses `fflate`, and XLSX template generation uses `write-excel-file` with a
small data-validation feature for the category dropdown. These packages are installed locally and
are not loaded from a CDN. XLSX code is dynamically imported only when an Excel file is parsed or
the Excel template is requested.

The raw file remains in the browser. It is not uploaded, logged, or permanently stored. Only the
five structured row fields below are sent to the public preview and commit endpoints.

## Canonical columns

| Column                | Required | Format                                                                                          |
| --------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `creator_name`        | Yes      | Best-known public creator name; 2–120 characters                                                |
| `category`            | Yes      | Stable category value or its display label, matched case-insensitively                          |
| `countries`           | No       | Country names or ISO 3166-1 alpha-2 codes; at most 10                                           |
| `requested_usernames` | Yes      | One to 10 public usernames; leading `@` is accepted                                             |
| `public_sources`      | Yes      | One to 10 complete public HTTP/HTTPS URLs stored for review; not ownership or identity evidence |

Separate multiple countries, usernames, or source URLs with semicolons or line breaks inside one
cell. Commas do not split list values because CSV uses commas between columns. The downloadable CSV
and Excel templates contain instructions, the complete category reference, and clearly fictional
example data. The Excel template provides a category dropdown for rows 2–251.

Supported stable category values are `music`, `film_tv`, `comedy`, `content_creator`,
`gaming_streaming`, `sports`, `fashion_beauty`, `visual_arts_design`, `dance`,
`writing_publishing`, `podcasting_audio`, `education`, `technology`,
`business_entrepreneurship`, and `other`. The corresponding labels accepted by the spreadsheet
parser are the labels shown by the individual form.

Headers are trimmed and matched case-insensitively. The accepted aliases are intentionally narrow:

| Canonical header      | Accepted aliases                                                      |
| --------------------- | --------------------------------------------------------------------- |
| `creator_name`        | `creator_name`, `creator name`, `creator public name`, `name`         |
| `category`            | `category`, `creator category`                                        |
| `countries`           | `countries`, `country`, `country codes`                               |
| `requested_usernames` | `requested_usernames`, `requested usernames`, `usernames`, `handles`  |
| `public_sources`      | `public_sources`, `public sources`, `source urls`, `supporting links` |

Unrelated columns are ignored with a warning. Duplicate raw headers, two aliases mapping to the
same canonical column, and missing required columns are errors; the browser never guesses an
unrelated column.

## Preview, duplicates, and commit

`POST /api/v1/submissions/bulk/preview` accepts structured JSON rows, performs no mutation, and
returns normalized values, a summary, row-level errors/warnings, exact/possible duplicate status,
and a SHA-256 preview checksum. The server enforces the 250-row and 2 MiB request limits even when a
caller bypasses the browser.

Exact equivalence uses a versioned SHA-256 fingerprint of the normalized creator name, controlled
category, sorted unique uppercase countries, sorted unique normalized usernames, and sorted unique
canonical public-source URLs. Input order does not change the fingerprint. Exact rows repeated in
one request or matching an existing pending/under-review submission are skipped. Rejected or other
terminal historical submissions do not permanently block a corrected resubmission.

Same-name, overlapping-username, primary-source, and reviewed Registry evidence can produce a
possible-duplicate warning. That warning is evidence for deliberate review, not proof that two
identities are equal. A possible duplicate is selectable only through explicit user confirmation.

`POST /api/v1/submissions/bulk/commit` receives the original structured rows, preview checksum,
selected row numbers, possible-duplicate confirmations, and a client-generated commit UUID. It
recalculates the checksum, revalidates all rows, rechecks duplicates immediately before insertion,
and never trusts browser-supplied statuses. A D1 transaction inserts the idempotency result and all
accepted normal pending submissions together. A partial unique index on non-null fingerprints for
pending/under-review rows prevents concurrent equivalent active submissions. Repeating a commit ID
with the same preview returns the stored row-level result; using it for changed rows is rejected.

The batch record stores only the commit reference, checksum, bounded result JSON, and timestamps.
It does not store the filename or raw spreadsheet. Each accepted creator has its own public
submission ID and appears in the existing admin queue. Admin reviewers can see the safe batch
reference and spreadsheet row number; all existing review actions remain unchanged.

## Abuse protection and privacy

Deployed environments use separate Cloudflare distributed rate-limit bindings for bulk preview and
bulk commit. Bulk preview is configured for 10 requests per 60 seconds and commit for 3 requests
per 60 seconds, independently of the existing single-submission limit. Local development permits
deterministic tests and does not claim in-memory enforcement is production-grade.

Do not include identity documents, passwords, private addresses, phone numbers, confidential
contracts, private notes, or private creator-claim evidence. Supporting links must be public. The
Registry stores accepted URLs for human review but does not fetch them from the browser, and their
submission does not establish account control, identity, legal ownership, approval, or a reserved
username.
