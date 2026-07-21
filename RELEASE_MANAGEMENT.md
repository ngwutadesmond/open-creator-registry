# Registry release management

A release is a versioned statement of reviewed local Registry content.

1. Create a uniquely named draft.
2. Calculate its deterministic snapshot from approved creators and non-released protected handles.
3. Review record counts, SHA-256 checksum, and the handle diff against the latest publication.
4. Request publication approval for that exact checksum and draft revision.
5. A different administrator approves.
6. Publish the unchanged approved snapshot. The prior published release becomes `superseded`.

Calculation may be repeated only while a release is a draft. Publication is atomic and rejects
stale or mismatched approval payloads. A published release may be withdrawn with an audited reason;
withdrawal does not delete its historical snapshot or audit evidence.

All local seed and browser-test releases are demonstration data. They do not imply an authoritative
global dataset. The public release page and API expose only published history and continue to state
that Registry status is not platform availability or legal ownership.
