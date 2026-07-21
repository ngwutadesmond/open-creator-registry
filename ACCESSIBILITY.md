# Accessibility

## Supported practices

The public and administration frontends target WCAG 2.1 AA-compatible interaction and presentation. They use semantic
header, navigation, main, section, form, list, and footer landmarks; one page-level heading; visible
focus styles; labelled controls; associated validation text; textual classification badges; live
loading/result announcements; accessible pagination; and real buttons/links for actions.

The mobile navigation moves focus into the opened navigation, closes with Escape, and returns focus
to its trigger. At narrow widths the visible `Menu` text is hidden without removing the accessible
button name. Reduced-motion preferences disable non-essential transitions, browser zoom is not
restricted, long handles/URLs wrap, and code output remains keyboard-scrollable.

## Validation and error behavior

- Handle and submission validation uses `aria-invalid` and `aria-describedby`.
- Submission summaries are focusable alerts and preserve the user's inputs after failure.
- API errors expose safe messages and request IDs without stack traces or SQL details.
- Loading states use `role="status"`; dynamic results use polite live regions.
- Classification is conveyed with a label and explanation, never color alone.

## Verification

Component tests cover labels, error association, dynamic content, keyboard submission, mobile
navigation Escape behavior, public-only navigation, and the private shell. Playwright runs axe WCAG
A rules on the rendered public home and admin dashboard and exercises keyboard/mobile workflows in
real Chromium. Manual inspection was completed at 1536×1024, 1280×800, 1024×768, 768×1024,
390×844, and 320×844 with browser console/request monitoring and document-overflow assertions at
every viewport.

The admin UI adds labelled scroll regions for wide tables, focus-restoring confirmation dialogs,
an Escape-dismissable drawer, textual statuses, explicit loading/empty/error states, and responsive
deep-link/overflow workflows. Destructive and critical actions require deliberate buttons
and server authorization; color is never the only status signal.

Automated rules do not replace assistive-technology testing. A manual screen-reader pass with
VoiceOver/NVDA and production-font/CSP checks remain appropriate before the first public release in
Phase 7.
