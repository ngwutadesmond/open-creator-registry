# Approval workflow

Critical hard-reserved handle creation, update, suspension, release, or restoration requires the
`handles:critical` permission and a second administrator. Registry release publication also uses a
separate request and decision.

1. The requester submits the intended normalized payload and reason.
2. The server records a pending approval, target revision, expiry, requester, and audit evidence.
3. The requester cannot approve their own request.
4. An authorized different administrator approves or rejects it.
5. Approval validates expiry, current status, payload shape, and target revision.
6. Critical handle application executes the guard, target write, decision, approval transition,
   and audit entry in one D1 batch.
7. Applied, rejected, expired, invalid, or stale requests cannot be replayed.

Release approval freezes the snapshot checksum and target update time. Publication revalidates both
before atomically publishing and superseding an earlier release. An approval decision is evidence,
not an identity claim.

## Reconciling elapsed deadlines

An administrator with `approvals:decide` can mark a past-due pending or approved request expired
from its detail page. `POST /api/admin/v1/approval-requests/{id}/expire` requires a reason and
`expected_revision`, copied exactly from the latest detail response's `updated_at`. The server
checks the deadline and revision, then atomically records the expired status and `approval.expired`
audit entry. Early, stale, terminal, and repeated attempts fail without changing the request.

The requester may record an elapsed deadline: this is not an approval decision. Existing decisions
remain intact and the proposed handle, profile, or release change is never applied. Review the
current target, conflicts, evidence, and other pending requests before creating any replacement;
expiry does not reissue a request or waive independent approval. No scheduled job performs expiry.

Every request, decision, application, rejection, and expiry retains the acting server-authenticated
identifier and request ID. There is no emergency override UI in Phase 5.
