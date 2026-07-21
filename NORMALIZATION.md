# Normalization

## Purpose and boundary

`@open-creator-registry/normalization` is the single implementation used by repository writes,
seeds, future APIs, and future ingestion. Normalization produces comparison keys and risk signals.
It never proves that two handles belong to the same person or organization.

## Canonical handle rules

`normalizeHandle` and `validateHandle` apply these rules:

1. Require a string at the validation boundary.
2. Trim surrounding whitespace.
3. Remove one or more leading ASCII `@` characters.
4. Apply Unicode NFKC compatibility normalization.
5. Remove leading `@` again if NFKC converted a full-width form.
6. Lowercase with the locale-independent `und` locale.
7. Convert spaces, periods, hyphens, and underscores to one underscore.
8. Collapse repeated separators and remove leading/trailing separators.
9. Allow Unicode letters, Unicode numbers, and underscores only.
10. Enforce a default length of 2–30 Unicode code points, with configurable limits.

Validation returns the untouched original string and the normalized comparison key. Repository
records separately retain display/original values where required.

## Separator decision

The stored canonical separator is underscore (`_`). Removing separators completely would erase
word boundaries and make operational review harder. Preserving underscore makes all these inputs
compare exactly while retaining readable token boundaries:

| Input               | Normalized output |
| ------------------- | ----------------- |
| `@Creator.Name`     | `creator_name`    |
| `creator-name`      | `creator_name`    |
| `creator name`      | `creator_name`    |
| `creator...---name` | `creator_name`    |
| `Ｃｒｅａｔｏｒ`    | `creator`         |

`createHandleCandidates` also returns a separatorless value for controlled comparison, but that is
not the stored canonical handle.

## Creator names

`normalizeCreatorName` applies NFKC, locale-independent lowercase, converts periods, hyphens, and
underscores to spaces, and collapses whitespace. It is a search and duplicate-detection key, not a
display name.

## Confusable skeleton abstraction

`createConfusableSkeleton` currently implements a deliberately small, replaceable mapping for
common username-impersonation signals:

- NFKC/NFKD compatibility forms and combining marks;
- common Cyrillic lookalikes such as `а`, `е`, `о`, `р`, `с`, `х`, and `і`;
- a small Greek lookalike subset;
- common numeric substitutions such as `0 → o`, `3 → e`, and `5 → s`;
- separator removal for skeleton comparison.

This is **not** full Unicode Technical Standard 39 compliance. The mapping is isolated behind one
function so a generated UTS 39 table or maintained library can replace it later without changing
repositories or API contracts. Skeleton equality is a review signal only.

## Variants

`isPotentialProtectedVariant` reports a signal when non-exact inputs share a separatorless or
confusable skeleton, or when a controlled marker such as `real`, `official`, `fan`, `fans`, or
`archive` is added. Examples:

| Candidate     | Protected handle | Signal | Reason                    |
| ------------- | ---------------- | ------ | ------------------------- |
| `aurora`      | `aurora`         | no     | exact, not a variant      |
| `аurora`      | `aurora`         | yes    | Cyrillic lookalike signal |
| `real_aurora` | `aurora`         | yes    | official-style marker     |
| `aurora_fans` | `aurora`         | yes    | fan marker                |
| `alex_jones`  | `alex_lee`       | no     | unrelated common name     |

The eventual policy layer decides whether a signal is soft-protected, monitored, or dismissed.
Neither fuzzy similarity nor a confusable match establishes identity.
