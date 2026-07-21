# Approved public-web connector boundary

No public-web connector or social-platform scraper is implemented. The future
`approved_public_web` access mode is descriptive policy metadata and never grants permission by
itself. Every future source requires a source-specific approval record before enablement.

An approved implementation must use public pages requiring no login, a fixed HTTPS host allowlist,
an identified user agent, reviewed robots.txt and applicable terms, strict rate/timeout/size limits,
allowlisted output fields, retrieval time and source URL provenance, and correction/removal support.
It must not retain full HTML without a documented need.

It must never accept arbitrary public-user URLs, bypass authentication or CAPTCHA, circumvent
anti-bot controls, rotate proxies for evasion, impersonate a normal session, or use stolen/shared
accounts. Creator-owned official websites may later be considered for extracting explicit public
profile links. Broad Instagram, Facebook, TikTok, YouTube, or X browser automation is deliberately
outside Phase 6.
