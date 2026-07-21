import { FormEvent, useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';

import { adminApi, AdminApiError } from '../api/admin-api-client';
import {
  candidateSchema,
  creatorSchema,
  dataEnvelopeSchema,
  listEnvelopeSchema,
  submissionSchema,
} from '../api/schemas';
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

type ReviewType = 'candidates' | 'submissions';

function ReviewList({ type }: { type: ReviewType }) {
  return type === 'candidates' ? <CandidateList /> : <SubmissionList />;
}

function ReviewFilters({ type }: { type: ReviewType }) {
  const [params, setParams] = useSearchParams();
  const submit = (event: FormEvent<HTMLFormElement>) => {
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
  return (
    <form className="filter-bar" onSubmit={submit}>
      <label>
        Status
        <select name="status" defaultValue={params.get('status') ?? ''}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          {type === 'submissions' ? <option value="under_review">Under review</option> : null}
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          {type === 'candidates' ? <option value="merged">Merged</option> : null}
        </select>
      </label>
      {type === 'candidates' ? (
        <label>
          Search
          <input name="query" defaultValue={params.get('query') ?? ''} />
        </label>
      ) : null}
      <button className="secondary-button">Apply filters</button>
    </form>
  );
}

const candidateListSchema = listEnvelopeSchema(candidateSchema);
function CandidateList() {
  const [params, setParams] = useSearchParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/candidates?${params}`, candidateListSchema, signal),
    [params],
  );
  const { resource, retry } = useAdminResource(load, `candidates:${params}`);
  const changePage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };
  return (
    <>
      <PageHeader
        title="Candidate review queue"
        description="Resolve discovered identities without automatically reserving handles."
      />
      <ReviewFilters type="candidates" />
      {resource.status === 'loading' ? (
        <LoadingState label="Loading candidates…" />
      ) : resource.status === 'error' ? (
        <ErrorState error={resource.error} onRetry={retry} />
      ) : resource.data.data.length === 0 ? (
        <EmptyState
          title="No candidates found"
          description="The current review filter has no records."
        />
      ) : (
        <>
          <DataTable
            caption="Candidate review queue"
            headers={['Creator', 'Source', 'Confidence', 'Status']}
          >
            {resource.data.data.map((record) => (
              <tr key={record.id}>
                <td>
                  <Link to={`/candidates/${record.id}`}>{record.canonical_name}</Link>
                  <small>{record.category ?? 'Uncategorised'}</small>
                </td>
                <td>{record.discovery_source}</td>
                <td>{record.confidence_score}%</td>
                <td>
                  <StatusBadge value={record.review_status} />
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

const submissionListSchema = listEnvelopeSchema(submissionSchema);
function SubmissionList() {
  const [params, setParams] = useSearchParams();
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/submissions?${params}`, submissionListSchema, signal),
    [params],
  );
  const { resource, retry } = useAdminResource(load, `submissions:${params}`);
  const changePage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    setParams(next);
  };
  return (
    <>
      <PageHeader
        title="Public submission queue"
        description="Review public suggestions without treating approval as a live reservation."
      />
      <ReviewFilters type="submissions" />
      {resource.status === 'loading' ? (
        <LoadingState label="Loading submissions…" />
      ) : resource.status === 'error' ? (
        <ErrorState error={resource.error} onRetry={retry} />
      ) : resource.data.data.length === 0 ? (
        <EmptyState
          title="No submissions found"
          description="The current review filter has no records."
        />
      ) : (
        <>
          <DataTable
            caption="Public submission queue"
            headers={['Creator', 'Requested handles', 'Created', 'Status']}
          >
            {resource.data.data.map((record) => (
              <tr key={record.id}>
                <td>
                  <Link to={`/submissions/${record.id}`}>{record.creator_name}</Link>
                  <small>{record.category ?? 'Uncategorised'}</small>
                </td>
                <td>{record.requested_handles.join(', ')}</td>
                <td>{new Date(record.created_at).toLocaleDateString()}</td>
                <td>
                  <StatusBadge value={record.submission_status} />
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

const candidateDetailSchema = dataEnvelopeSchema(
  z.object({
    candidate: candidateSchema,
    potential_creator_matches: z.array(creatorSchema),
    policy: z.string(),
  }),
);
const submissionDetailSchema = dataEnvelopeSchema(
  z.object({
    submission: submissionSchema,
    potential_creator_matches: z.array(creatorSchema),
    policy: z.string(),
  }),
);

function CandidateDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/candidates/${id}`, candidateDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [action, setAction] = useState<'approve' | 'reject' | 'request-review' | 'merge' | null>(
    null,
  );
  const [reason, setReason] = useState('Reviewed public evidence and Registry policy.');
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading candidate…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const data = resource.data.data;
  const apply = async () => {
    if (!action) return;
    try {
      const body =
        action === 'approve'
          ? { reason, create_creator_draft: true }
          : action === 'merge'
            ? { reason, target_creator_id: target }
            : { reason };
      await adminApi.post(
        `/api/admin/v1/candidates/${id}/${action}`,
        body,
        dataEnvelopeSchema(z.unknown()),
      );
      setMessage(`Candidate ${action} recorded. No handle was automatically reserved.`);
      setAction(null);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setAction(null);
    }
  };
  return (
    <>
      <PageHeader title={data.candidate.canonical_name} description="Candidate evidence review" />
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <div className="record-summary">
        <div>
          <span>Status</span>
          <StatusBadge value={data.candidate.review_status} />
        </div>
        <div>
          <span>Confidence</span>
          <strong>{data.candidate.confidence_score}%</strong>
        </div>
        <div>
          <span>Discovery source</span>
          <strong>{data.candidate.discovery_source}</strong>
        </div>
      </div>
      <div className="policy-callout">
        <strong>Identity boundary</strong>
        <p>{data.policy}</p>
      </div>
      <section className="panel">
        <h2>Potential creator matches</h2>
        {data.potential_creator_matches.length ? (
          <ul className="activity-list">
            {data.potential_creator_matches.map((creator) => (
              <li key={creator.id}>
                <Link to={`/creators/${creator.id}`}>{creator.canonical_name}</Link>
                <button
                  className="text-button"
                  onClick={() => {
                    setTarget(creator.id);
                    setAction('merge');
                  }}
                >
                  Merge into this creator
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No exact normalized creator match"
            description="A reviewer must still assess common-name and confusable risks."
          />
        )}
      </section>
      <div className="form-actions">
        <button className="primary-button" onClick={() => setAction('approve')}>
          Approve to creator draft
        </button>
        <button className="secondary-button" onClick={() => setAction('request-review')}>
          Request more review
        </button>
        <button className="danger-button" onClick={() => setAction('reject')}>
          Reject
        </button>
      </div>
      <ConfirmationDialog
        open={Boolean(action)}
        title={`${action ?? 'Review'} candidate?`}
        description={`${reason} This action never creates a live handle reservation.`}
        confirmLabel={`Confirm ${action ?? 'review'}`}
        onCancel={() => setAction(null)}
        onConfirm={() => void apply()}
      />
      <label className="decision-reason">
        Decision reason
        <textarea value={reason} onChange={(event) => setReason(event.currentTarget.value)} />
      </label>
    </>
  );
}

function SubmissionDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/submissions/${id}`, submissionDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [action, setAction] = useState<
    'start-review' | 'approve' | 'reject' | 'convert-to-candidate' | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading submission…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const data = resource.data.data;
  const apply = async () => {
    if (!action) return;
    await adminApi.post(
      `/api/admin/v1/submissions/${id}/${action}`,
      { reason: 'Reviewed against public submission and identity evidence policy.' },
      dataEnvelopeSchema(z.unknown()),
    );
    setMessage(`Submission action recorded. Zero live handles were created.`);
    setAction(null);
    retry();
  };
  return (
    <>
      <PageHeader
        title={data.submission.creator_name}
        description="Public creator submission review"
      />
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      <div className="policy-callout">
        <strong>No automatic reservation</strong>
        <p>{data.policy}</p>
      </div>
      <section className="panel">
        <dl className="definition-grid">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge value={data.submission.submission_status} />
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{data.submission.category ?? 'Not supplied'}</dd>
          </div>
          <div>
            <dt>Countries</dt>
            <dd>{data.submission.country_codes?.join(', ') || 'Not supplied'}</dd>
          </div>
          <div>
            <dt>Requested handles</dt>
            <dd>{data.submission.requested_handles.join(', ')}</dd>
          </div>
        </dl>
        <h3>Public sources</h3>
        <ul>
          {data.submission.public_sources.map((source) => (
            <li key={source}>
              <a href={source} target="_blank" rel="noreferrer">
                {source}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2>Potential existing creators</h2>
        {data.potential_creator_matches.length ? (
          data.potential_creator_matches.map((creator) => (
            <Link key={creator.id} to={`/creators/${creator.id}`}>
              {creator.canonical_name}
            </Link>
          ))
        ) : (
          <p className="muted-copy">No exact normalized creator record.</p>
        )}
      </section>
      <div className="form-actions">
        <button className="primary-button" onClick={() => setAction('convert-to-candidate')}>
          Convert to candidate
        </button>
        <button className="secondary-button" onClick={() => setAction('start-review')}>
          Start review
        </button>
        <button className="secondary-button" onClick={() => setAction('approve')}>
          Approve submission
        </button>
        <button className="danger-button" onClick={() => setAction('reject')}>
          Reject
        </button>
      </div>
      <ConfirmationDialog
        open={Boolean(action)}
        title={`${action ?? 'Review'} submission?`}
        description="The decision is audited and will not automatically create a creator or reserved handle."
        confirmLabel="Confirm decision"
        onCancel={() => setAction(null)}
        onConfirm={() => void apply()}
      />
    </>
  );
}

export default function ReviewPages({ type, mode }: { type: ReviewType; mode: 'list' | 'detail' }) {
  const { recordId } = useParams();
  if (mode === 'list') return <ReviewList type={type} />;
  if (!recordId)
    return (
      <EmptyState title="Record not found" description="The review record identifier is missing." />
    );
  return type === 'candidates' ? (
    <CandidateDetail id={recordId} />
  ) : (
    <SubmissionDetail id={recordId} />
  );
}
