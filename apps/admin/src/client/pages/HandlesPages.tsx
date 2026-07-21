import { FormEvent, useCallback, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';

import { adminApi, AdminApiError } from '../api/admin-api-client';
import {
  aliasSchema,
  approvalSchema,
  auditSchema,
  creatorSchema,
  dataEnvelopeSchema,
  handleSchema,
  listEnvelopeSchema,
} from '../api/schemas';
import { useAdminIdentity } from '../app/AdminIdentityContext';
import {
  ConfirmationDialog,
  DataTable,
  Feedback,
  PageHeader,
  Pagination,
  StatusBadge,
} from '../components/AdminPrimitives';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncStates';
import { useAdminResource } from '../hooks/useAdminResource';
import { formText } from '../utils/forms';

const handleDetailSchema = dataEnvelopeSchema(
  z.object({
    handle: handleSchema,
    creator: creatorSchema,
    conflicts: z.object({ exact: handleSchema.nullable(), confusable: z.array(handleSchema) }),
    audit_history: z.array(auditSchema),
    approval_requests: z.array(approvalSchema),
  }),
);
const handleMutationSchema = dataEnvelopeSchema(
  z.union([
    handleSchema,
    z.object({ approval_request: z.unknown(), intended_change: z.unknown() }),
  ]),
);
const conflictPreviewSchema = z.object({
  input: z.string(),
  normalized_handle: z.string(),
  confusable_skeleton: z.string(),
  exact_conflict: handleSchema.nullable(),
  confusable_conflicts: z.array(handleSchema),
  alias_conflicts: z.array(aliasSchema),
  creator: creatorSchema.nullable(),
  requires_second_approval: z.boolean(),
});

function HandleForm() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAdminIdentity();
  const [error, setError] = useState<AdminApiError | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [preview, setPreview] = useState<z.infer<typeof conflictPreviewSchema> | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(null);
    const body = {
      creator_entity_id: formText(data, 'creator_entity_id'),
      display_handle: formText(data, 'display_handle'),
      classification: formText(data, 'classification'),
      confidence_score: Number(data.get('confidence_score')),
      decision_source: formText(data, 'decision_source'),
      reason: formText(data, 'reason'),
      status: 'active',
    };
    try {
      const result = await adminApi.post(
        '/api/admin/v1/reserved-handles',
        body,
        handleMutationSchema,
      );
      if ('id' in result.data) void navigate(`/handles/${result.data.id}`);
      else {
        setConflict(
          'This critical change entered the two-person approval queue. It is not live yet.',
        );
        setPreview(null);
        form.reset();
      }
    } catch (caught) {
      setError(caught as AdminApiError);
    } finally {
      setBusy(false);
    }
  };
  const check = async (event: React.FocusEvent<HTMLInputElement>) => {
    if (!event.currentTarget.value.trim()) return;
    const form = event.currentTarget.form;
    const creatorId = form
      ? formText(new FormData(form), 'creator_entity_id')
      : params.get('creator_id') || '';
    try {
      const result = await adminApi.post(
        '/api/admin/v1/reserved-handles/check-conflicts',
        {
          handle: event.currentTarget.value,
          creator_entity_id: creatorId || undefined,
        },
        dataEnvelopeSchema(conflictPreviewSchema),
      );
      setPreview(result.data);
      setConflict(
        result.data.exact_conflict
          ? `Exact conflict: @${result.data.exact_conflict.normalized_handle}.`
          : result.data.confusable_conflicts.length
            ? `${result.data.confusable_conflicts.length} confusable risk signal(s) require review.`
            : result.data.alias_conflicts.length
              ? `${result.data.alias_conflicts.length} alias conflict(s) require review.`
              : 'No local exact or confusable conflicts were found.',
      );
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  return (
    <>
      <PageHeader
        title="Reserve handle"
        description="Normalization and confusable checks are risk signals. They do not prove identity."
      />
      {conflict ? (
        <Feedback kind={conflict.startsWith('No local') ? 'success' : 'info'}>{conflict}</Feedback>
      ) : null}
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <form className="admin-form panel" onSubmit={(event) => void submit(event)}>
        <div className="form-grid">
          <label>
            Creator ID
            <input
              required
              name="creator_entity_id"
              defaultValue={params.get('creator_id') ?? ''}
              onChange={() => setPreview(null)}
            />
          </label>
          <label>
            Display handle
            <input
              required
              minLength={2}
              name="display_handle"
              placeholder="@creator"
              onChange={() => setPreview(null)}
              onBlur={(event) => void check(event)}
            />
          </label>
          <label>
            Classification
            <select name="classification">
              <option value="hard_reserved">Hard reserved</option>
              <option value="soft_protected">Soft protected</option>
              <option value="monitored">Monitored</option>
            </select>
          </label>
          <label>
            Confidence score
            <input
              required
              name="confidence_score"
              type="number"
              min={0}
              max={100}
              defaultValue={90}
            />
          </label>
          <label>
            Decision source
            <input required name="decision_source" placeholder="Editorial review" />
          </label>
          <label className="full-field">
            Reason
            <textarea
              required
              minLength={10}
              rows={5}
              name="reason"
              placeholder="Explain the public evidence and protection decision."
            />
          </label>
        </div>
        {preview ? (
          <section className="conflict-preview" aria-labelledby="conflict-preview-title">
            <h2 id="conflict-preview-title">Conflict preview</h2>
            <dl className="definition-grid">
              <div>
                <dt>Entered handle</dt>
                <dd>{preview.input}</dd>
              </div>
              <div>
                <dt>Normalized handle</dt>
                <dd>
                  <code>{preview.normalized_handle}</code>
                </dd>
              </div>
              <div>
                <dt>Confusable skeleton</dt>
                <dd>
                  <code>{preview.confusable_skeleton}</code>
                </dd>
              </div>
              <div>
                <dt>Associated creator</dt>
                <dd>{preview.creator?.canonical_name ?? 'Creator not found'}</dd>
              </div>
              <div>
                <dt>Exact conflict</dt>
                <dd>
                  {preview.exact_conflict ? `@${preview.exact_conflict.normalized_handle}` : 'None'}
                </dd>
              </div>
              <div>
                <dt>Confusable conflicts</dt>
                <dd>{preview.confusable_conflicts.length}</dd>
              </div>
              <div>
                <dt>Alias conflicts</dt>
                <dd>{preview.alias_conflicts.length}</dd>
              </div>
              <div>
                <dt>Second approval</dt>
                <dd>
                  {preview.requires_second_approval
                    ? 'Required for a hard-reserved decision'
                    : 'Not required by creator tier'}
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <Feedback kind="info">
            Enter the creator and handle, then leave the handle field to generate the required
            conflict preview.
          </Feedback>
        )}
        <div className="policy-callout">
          <strong>Critical safeguard</strong>
          <p>
            Hard-reserved changes for critical creators require a distinct second administrator.
            Submission creates an approval request; it does not make the handle live.
          </p>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            disabled={busy || !can('handles:write') || !preview || Boolean(preview.exact_conflict)}
            type="submit"
          >
            {busy ? 'Submitting…' : 'Submit reservation'}
          </button>
        </div>
      </form>
    </>
  );
}

function HandleDetail({ id }: { id: string }) {
  const { can } = useAdminIdentity();
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/reserved-handles/${id}`, handleDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [action, setAction] = useState<'suspend' | 'release' | 'restore' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [editing, setEditing] = useState(false);
  if (resource.status === 'loading') return <LoadingState label="Loading handle decision…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const {
    handle,
    creator,
    conflicts,
    audit_history: audits,
    approval_requests: approvals,
  } = resource.data.data;
  const apply = async () => {
    if (!action) return;
    try {
      const result = await adminApi.post(
        `/api/admin/v1/reserved-handles/${id}/${action}`,
        { reason: `${action} requested after reviewed Registry evidence.` },
        handleMutationSchema,
      );
      setFeedback(
        'id' in result.data
          ? `Handle ${action} completed.`
          : `Handle ${action} entered the approval queue and is not live yet.`,
      );
      setAction(null);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setAction(null);
    }
  };
  const update = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await adminApi.patch(
        `/api/admin/v1/reserved-handles/${id}`,
        {
          display_handle: formText(data, 'display_handle'),
          classification: formText(data, 'classification'),
          confidence_score: Number(data.get('confidence_score')),
          decision_source: formText(data, 'decision_source'),
          reason: formText(data, 'reason'),
        },
        handleMutationSchema,
      );
      setFeedback(
        'id' in result.data
          ? 'Handle decision updated.'
          : 'This critical edit entered the two-person approval queue and is not live yet.',
      );
      setEditing(false);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  return (
    <>
      <PageHeader
        title={`@${handle.normalized_handle}`}
        description={`Protected for ${creator.canonical_name}`}
        actions={
          <>
            <button
              className="primary-button"
              disabled={!can('handles:write')}
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? 'Cancel editing' : 'Edit decision'}
            </button>
            <Link className="secondary-button" to={`/creators/${creator.id}`}>
              View creator
            </Link>
          </>
        }
      />
      {feedback ? <Feedback kind="success">{feedback}</Feedback> : null}
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <div className="record-summary">
        <div>
          <span>Classification</span>
          <StatusBadge value={handle.classification} />
        </div>
        <div>
          <span>Status</span>
          <StatusBadge value={handle.status} />
        </div>
        <div>
          <span>Confidence</span>
          <strong>{handle.confidence_score}%</strong>
        </div>
        <div>
          <span>Skeleton</span>
          <code>{handle.confusable_skeleton}</code>
        </div>
      </div>
      <section className="panel">
        <h2>Decision rationale</h2>
        <p>{handle.reason}</p>
        <dl className="definition-grid">
          <div>
            <dt>Decision source</dt>
            <dd>{handle.decision_source}</dd>
          </div>
          <div>
            <dt>Original display</dt>
            <dd>{handle.display_handle}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{new Date(handle.updated_at).toLocaleString()}</dd>
          </div>
        </dl>
      </section>
      {editing ? (
        <form className="admin-form panel" onSubmit={(event) => void update(event)}>
          <div className="section-heading">
            <div>
              <h2>Edit handle decision</h2>
              <p>The server recalculates normalization and applies critical approval rules.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Display handle
              <input required name="display_handle" defaultValue={handle.display_handle} />
            </label>
            <label>
              Classification
              <select name="classification" defaultValue={handle.classification}>
                <option value="hard_reserved">Hard reserved</option>
                <option value="soft_protected">Soft protected</option>
                <option value="monitored">Monitored</option>
              </select>
            </label>
            <label>
              Confidence
              <input
                required
                name="confidence_score"
                type="number"
                min={0}
                max={100}
                defaultValue={handle.confidence_score}
              />
            </label>
            <label>
              Decision source
              <input required name="decision_source" defaultValue={handle.decision_source} />
            </label>
            <label className="full-field">
              Public reason
              <textarea
                required
                minLength={10}
                rows={5}
                name="reason"
                defaultValue={handle.reason}
              />
            </label>
          </div>
          <button className="primary-button" type="submit">
            Save decision
          </button>
        </form>
      ) : null}
      <section className="panel">
        <div className="section-heading">
          <h2>Confusable risk signals</h2>
          <p>A skeleton collision never establishes that two people are the same.</p>
        </div>
        {conflicts.confusable.length ? (
          <ul className="activity-list">
            {conflicts.confusable.map((item) => (
              <li key={item.id}>
                <Link to={`/handles/${item.id}`}>@{item.normalized_handle}</Link>
                <StatusBadge value={item.classification} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No other skeleton collision"
            description="The exact decision still depends on reviewed identity evidence."
          />
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Approval requests</h2>
            <p>Review the exact critical change before it can affect public classifications.</p>
          </div>
        </div>
        {approvals.length ? (
          <ul className="activity-list">
            {approvals.map((approval) => (
              <li key={approval.id}>
                <Link to={`/approvals/${approval.id}`}>{approval.action_type}</Link>
                <StatusBadge value={approval.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No approval requests are associated with this handle.</p>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Audit history</h2>
            <p>Append-only changes to this protection decision.</p>
          </div>
          <Link to={`/audit-logs?entity_id=${handle.id}`}>Open audit explorer</Link>
        </div>
        {audits.length ? (
          <ul className="activity-list">
            {audits.map((audit) => (
              <li key={audit.id}>
                <Link to={`/audit-logs/${audit.id}`}>{audit.action}</Link>
                <span>
                  {new Date(audit.created_at).toLocaleString()} · {audit.actor_identifier}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-copy">No administrative history has been recorded yet.</p>
        )}
      </section>
      <div className="danger-zone">
        <h2>Lifecycle controls</h2>
        <p>
          Released handles stop affecting public checks. Suspended handles retain evidence but are
          not active.
        </p>
        <div className="form-actions">
          {handle.status !== 'active' ? (
            <button
              className="secondary-button"
              disabled={!can('handles:write')}
              onClick={() => setAction('restore')}
            >
              Restore
            </button>
          ) : (
            <button
              className="secondary-button"
              disabled={!can('handles:write')}
              onClick={() => setAction('suspend')}
            >
              Suspend
            </button>
          )}
          <button
            className="danger-button"
            disabled={handle.status === 'released' || !can('handles:write')}
            onClick={() => setAction('release')}
          >
            Release handle
          </button>
        </div>
      </div>
      <ConfirmationDialog
        open={Boolean(action)}
        title={`${action ?? 'Change'} protected handle?`}
        description="This protection decision affects consuming-platform recommendations and will be recorded in the append-only audit history."
        confirmLabel={`Confirm ${action ?? 'change'}`}
        onCancel={() => setAction(null)}
        onConfirm={() => void apply()}
      />
    </>
  );
}

function HandleList() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(
        `/api/admin/v1/reserved-handles?${key}`,
        listEnvelopeSchema(handleSchema),
        signal,
      ),
    [key],
  );
  const { resource, retry } = useAdminResource(load, key);
  const filter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setParams(
      [...data.entries()]
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
        )
        .map(([name, value]): [string, string] => [name, value]),
    );
  };
  const changePage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };
  return (
    <>
      <PageHeader
        title="Reserved handles"
        description="Inspect exact, variant, and monitored Registry decisions."
        actions={
          <Link className="primary-button" to="/handles/new">
            Reserve handle
          </Link>
        }
      />
      <form className="filter-bar" onSubmit={filter}>
        <label>
          Handle search
          <input name="query" defaultValue={params.get('query') ?? ''} />
        </label>
        <label>
          Classification
          <select name="classification" defaultValue={params.get('classification') ?? ''}>
            <option value="">All classifications</option>
            <option value="hard_reserved">Hard reserved</option>
            <option value="soft_protected">Soft protected</option>
            <option value="monitored">Monitored</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.get('status') ?? ''}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="released">Released</option>
            <option value="disputed">Disputed</option>
          </select>
        </label>
        <label>
          Creator tier
          <select name="creator_tier" defaultValue={params.get('creator_tier') ?? ''}>
            <option value="">All creator tiers</option>
            <option value="critical">Critical</option>
            <option value="notable">Notable</option>
            <option value="watchlist">Watchlist</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <label>
          Creator ID
          <input name="creator_id" defaultValue={params.get('creator_id') ?? ''} />
        </label>
        <button className="secondary-button">Apply filters</button>
      </form>
      {resource.status === 'loading' ? (
        <LoadingState label="Loading protected handles…" />
      ) : resource.status === 'error' ? (
        <ErrorState error={resource.error} onRetry={retry} />
      ) : resource.data.data.length === 0 ? (
        <EmptyState
          title="No handles found"
          description="Adjust the filters or add a reviewed protection decision."
        />
      ) : (
        <>
          <DataTable
            caption="Reserved handle decisions"
            headers={['Handle', 'Classification', 'Confidence', 'Status']}
          >
            {resource.data.data.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/handles/${item.id}`}>@{item.normalized_handle}</Link>
                </td>
                <td>
                  <StatusBadge value={item.classification} />
                </td>
                <td>{item.confidence_score}%</td>
                <td>
                  <StatusBadge value={item.status} />
                </td>
              </tr>
            ))}
          </DataTable>
          <Pagination
            page={resource.data.meta.pagination.page}
            totalPages={resource.data.meta.pagination.total_pages}
            total={resource.data.meta.pagination.total}
            hasPreviousPage={resource.data.meta.pagination.has_previous_page}
            hasNextPage={resource.data.meta.pagination.has_next_page}
            onPageChange={changePage}
          />
        </>
      )}
    </>
  );
}

export default function HandlesPages({ mode }: { mode: 'list' | 'new' | 'detail' }) {
  const { handleId } = useParams();
  if (mode === 'list') return <HandleList />;
  if (mode === 'new') return <HandleForm />;
  return handleId ? (
    <HandleDetail id={handleId} />
  ) : (
    <EmptyState title="Handle not found" description="The handle identifier is missing." />
  );
}
