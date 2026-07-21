# Creator external profiles

External profiles are optional normalized child records. Supported stored platforms are YouTube,
Spotify, TikTok, Instagram, X, Facebook, Twitch, SoundCloud, Apple Music, official website, and
other. Input `twitter` normalizes to `x`. At least one stable account ID, handle, or HTTPS URL is
required.

Platform URLs must use the documented platform host. Official/other sites reject credentials,
loopback, private/local hosts, unsafe schemes, and fragments. Stable `(platform, account ID)` and
normalized URL values are globally unique; a creator can have only one primary record per platform.
Conflicting account IDs, URLs, primaries, and source associations are presented for review and are
never resolved from display-name similarity.

Verification statuses are `unverified`, `source_linked`, `cross_source_confirmed`,
`manually_verified`, `creator_verified`, `stale`, `disputed`, and `rejected`. Visibility is `public`,
`private`, or `suppressed`. Public creator detail includes only public profiles in one of the four
positive verification states. It excludes source references, confidence, connector details,
private/suppressed/disputed/rejected data, and administrative evidence.

Administrators can add, edit, dispute, change visibility, review provenance/conflicts, select a
primary association, and safely suppress records. Deletion is a retained suppression rather than a
physical removal. Identity-redirecting changes for critical creators use existing expiring,
different-person approval with stale-target and replay guards. Every mutation is audited.

`source_linked` means an approved source associated the profile; it does not prove identity,
ownership, endorsement, or account control.
