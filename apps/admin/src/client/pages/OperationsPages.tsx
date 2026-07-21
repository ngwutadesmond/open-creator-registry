import { FormEvent, useCallback, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';

import { adminApi, AdminApiError } from '../api/admin-api-client';
import {
  approvalSchema,
  auditSchema,
  dataEnvelopeSchema,
  importBatchSchema,
  ingestionRunSchema,
  listEnvelopeSchema,
  releaseSchema,
  sourceCheckpointSchema,
  sourceConfigurationSchema,
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

type OperationType = 'imports' | 'ingestion' | 'releases' | 'approvals' | 'audits' | 'settings';
const paths: Record<Exclude<OperationType, 'settings'>, string> = {
  imports: 'imports',
  ingestion: 'ingestion-runs',
  releases: 'releases',
  approvals: 'approval-requests',
  audits: 'audit-logs',
};
const schemas = {
  imports: importBatchSchema,
  ingestion: ingestionRunSchema,
  releases: releaseSchema,
  approvals: approvalSchema,
  audits: auditSchema,
} as const;
const importDetailSchema = dataEnvelopeSchema(
  z.object({
    batch: importBatchSchema,
    errors: z.array(
      z.object({
        id: z.string(),
        import_batch_id: z.string(),
        row_number: z.number(),
        error_code: z.string(),
        error_message: z.string(),
        field_name: z.string().nullable(),
        raw_value: z.string().nullable(),
        created_at: z.string(),
      }),
    ),
  }),
);
const releaseDetailSchema = dataEnvelopeSchema(
  z.object({
    release: releaseSchema,
    snapshot: z.unknown().nullable(),
    approval_requests: z.array(approvalSchema),
    audit_history: z.array(auditSchema),
    demonstration_data_warning: z.string(),
  }),
);
const approvalDetailSchema = dataEnvelopeSchema(
  z.object({ approval: approvalSchema, decisions: z.array(z.unknown()) }),
);

const sourceConfigurationListSchema = dataEnvelopeSchema(
  z.object({
    configurations: z.array(sourceConfigurationSchema),
    checkpoints: z.array(sourceCheckpointSchema),
    locks: z.array(z.unknown()),
  }),
);

function SourceConfigurationPanel({ onRun }: { onRun: () => void }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get('/api/admin/v1/source-configurations', sourceConfigurationListSchema, signal),
    [],
  );
  const { resource, retry } = useAdminResource(load, 'source-configurations');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [checkpointToReset, setCheckpointToReset] = useState<
    z.infer<typeof sourceCheckpointSchema> | undefined
  >();
  if (resource.status === 'loading') return <LoadingState label="Loading source configuration…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const update = async (sourceName: string, enabled: boolean) => {
    setBusy(`toggle:${sourceName}`);
    setError(null);
    try {
      await adminApi.patch(
        `/api/admin/v1/source-configurations/${sourceName}`,
        {
          enabled,
          dry_run: !enabled,
          reason: `${enabled ? 'Enable' : 'Disable'} fixture-backed local source.`,
        },
        dataEnvelopeSchema(sourceConfigurationSchema),
      );
      setMessage(`${sourceName} ${enabled ? 'enabled' : 'disabled'}.`);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    } finally {
      setBusy(null);
    }
  };
  const resetCheckpoint = async () => {
    if (!checkpointToReset) return;
    setBusy(`reset:${checkpointToReset.id}`);
    try {
      await adminApi.post(
        `/api/admin/v1/source-checkpoints/${checkpointToReset.id}/reset`,
        { reason: 'Reset local fixture checkpoint after administrator confirmation.' },
        dataEnvelopeSchema(sourceCheckpointSchema.nullable()),
      );
      setMessage('Checkpoint reset to the beginning of the configured scope.');
      setCheckpointToReset(undefined);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setCheckpointToReset(undefined);
    } finally {
      setBusy(null);
    }
  };
  const run = async (sourceName: string, preview: boolean) => {
    setBusy(`${preview ? 'preview' : 'run'}:${sourceName}`);
    setError(null);
    try {
      const response = await adminApi.post(
        `/api/admin/v1/ingestion-runs/${preview ? 'preview' : 'start'}`,
        { source_name: sourceName, scope_key: 'default' },
        dataEnvelopeSchema(z.unknown()),
      );
      setMessage(`${preview ? 'Preview' : 'Bounded ingestion run'} completed for ${sourceName}.`);
      if (!preview) onRun();
      void response;
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    } finally {
      setBusy(null);
    }
  };
  const { configurations, checkpoints } = resource.data.data;
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Source configurations</h2>
        <p>
          External connectors remain disabled by default. Local Wikidata runs require fixture mode
          unless a developer explicitly opts into the public endpoint.
        </p>
      </div>
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <DataTable
        caption="Source connector configuration"
        headers={['Source', 'Access', 'Limits', 'Checkpoint', 'License', 'Actions']}
      >
        {configurations.map((configuration) => {
          const checkpoint = checkpoints.find(
            (item) => item.source_name === configuration.source_name,
          );
          return (
            <tr key={configuration.source_name}>
              <td>
                <strong>{configuration.source_name}</strong>
                <StatusBadge value={configuration.enabled ? 'enabled' : 'disabled'} />
                <small>
                  {configuration.scheduled_enabled ? 'Scheduled locally' : 'Manual only'}
                </small>
              </td>
              <td>
                {configuration.access_mode}
                <small>{configuration.connector_version}</small>
              </td>
              <td>
                {configuration.batch_size}/page · {configuration.maximum_records_per_run}/run
              </td>
              <td>
                {checkpoint?.cursor ?? 'Start'}
                <small>{checkpoint?.last_success_at ?? 'Never completed'}</small>
                {checkpoint ? (
                  <button className="text-button" onClick={() => setCheckpointToReset(checkpoint)}>
                    Reset checkpoint
                  </button>
                ) : null}
              </td>
              <td>{configuration.source_license}</td>
              <td>
                <button
                  className="text-button"
                  disabled={Boolean(busy)}
                  onClick={() => void update(configuration.source_name, !configuration.enabled)}
                >
                  {configuration.enabled ? 'Disable' : 'Enable'}
                </button>{' '}
                <button
                  className="text-button"
                  disabled={Boolean(busy) || !configuration.enabled}
                  onClick={() => void run(configuration.source_name, true)}
                >
                  Preview
                </button>{' '}
                <button
                  className="text-button"
                  disabled={Boolean(busy) || !configuration.enabled}
                  onClick={() => void run(configuration.source_name, false)}
                >
                  Run
                </button>
              </td>
            </tr>
          );
        })}
      </DataTable>
      <ConfirmationDialog
        open={Boolean(checkpointToReset)}
        title="Reset this source checkpoint?"
        description="The next bounded run starts from the beginning of this reviewed source scope. Existing candidates are updated idempotently."
        confirmLabel="Reset checkpoint"
        onCancel={() => setCheckpointToReset(undefined)}
        onConfirm={() => void resetCheckpoint()}
      />
    </section>
  );
}

function ImportPanel({ onCreated }: { onCreated: (id: string) => void }) {
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminApiError | null>(null);
  const preview = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await adminApi.post(
        '/api/admin/v1/imports/preview',
        { format, file_name: `manual-preview.${format}`, content },
        dataEnvelopeSchema(
          z.object({
            batch: importBatchSchema,
            errors: z.array(z.unknown()),
            records: z.array(z.unknown()),
            warnings: z.array(z.unknown()),
          }),
        ),
      );
      onCreated(response.data.batch.id);
    } catch (caught) {
      setError(caught as AdminApiError);
    } finally {
      setBusy(false);
    }
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 262_144) {
      setError(
        new AdminApiError({
          code: 'request_too_large',
          message: 'Import files are limited to 256 KiB.',
          status: 413,
        }),
      );
      return;
    }
    setContent(await file.text());
    if (file.name.endsWith('.csv')) setFormat('csv');
    else setFormat('json');
  };
  return (
    <form className="admin-form panel" onSubmit={(event) => void preview(event)}>
      <div className="section-heading">
        <h2>Preview a bounded import</h2>
        <p>
          Validation, normalization, duplicate checks, and warnings run before any Registry record
          changes.
        </p>
      </div>
      <div className="form-grid">
        <label>
          Format
          <select
            value={format}
            onChange={(event) => setFormat(event.currentTarget.value as 'json' | 'csv')}
          >
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <label>
          Choose file
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(event) => void readFile(event.currentTarget.files?.[0])}
          />
        </label>
        <label className="full-field">
          Import content
          <textarea
            required
            rows={12}
            value={content}
            onChange={(event) => setContent(event.currentTarget.value)}
            placeholder={
              format === 'json'
                ? '[{"record_type":"creator", ...}]'
                : 'record_type,canonical_name,...'
            }
          />
        </label>
      </div>
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <button className="primary-button" disabled={busy}>
        {busy ? 'Validating…' : 'Create dry-run preview'}
      </button>
    </form>
  );
}

function OperationList({ type }: { type: Exclude<OperationType, 'settings'> }) {
  const [params, setParams] = useSearchParams();
  const key = `${type}:${params}`;
  const itemSchema = schemas[type];
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(
        `/api/admin/v1/${paths[type]}?${params}`,
        listEnvelopeSchema(itemSchema),
        signal,
      ),
    [itemSchema, params, type],
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
        .map(([name, value]): [string, string] => [
          name,
          name === 'from' || name === 'to' ? new Date(value).toISOString() : value,
        ]),
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
        title={
          {
            imports: 'Data imports',
            ingestion: 'Ingestion runs',
            releases: 'Registry releases',
            approvals: 'Approval queue',
            audits: 'Audit logs',
          }[type]
        }
        description={
          {
            imports: 'Preview and commit validated JSON or CSV records.',
            ingestion: 'Inspect bounded local import execution history.',
            releases: 'Calculate immutable snapshots and publish through two-person approval.',
            approvals: 'Review sensitive changes before they become live.',
            audits: 'Read-only administrative mutation history.',
          }[type]
        }
        actions={type === 'releases' ? <ReleaseCreate onCreated={retry} /> : undefined}
      />
      {type === 'imports' ? (
        <ImportPanel
          onCreated={(id) => {
            window.location.assign(`/imports/${id}`);
          }}
        />
      ) : null}
      {type === 'ingestion' ? <SourceConfigurationPanel onRun={retry} /> : null}
      {type === 'audits' ? (
        <form className="filter-bar" onSubmit={filter}>
          <label>
            Action
            <input name="action" defaultValue={params.get('action') ?? ''} />
          </label>
          <label>
            Administrator
            <input name="administrator" defaultValue={params.get('administrator') ?? ''} />
          </label>
          <label>
            Entity type
            <input name="entity_type" defaultValue={params.get('entity_type') ?? ''} />
          </label>
          <label>
            Entity ID
            <input name="entity_id" defaultValue={params.get('entity_id') ?? ''} />
          </label>
          <label>
            From
            <input name="from" type="datetime-local" defaultValue={params.get('from') ?? ''} />
          </label>
          <label>
            To
            <input name="to" type="datetime-local" defaultValue={params.get('to') ?? ''} />
          </label>
          <button className="secondary-button">Apply filters</button>
        </form>
      ) : null}
      {resource.status === 'loading' ? (
        <LoadingState label={`Loading ${type}…`} />
      ) : resource.status === 'error' ? (
        <ErrorState error={resource.error} onRetry={retry} />
      ) : resource.data.data.length === 0 ? (
        <EmptyState
          title={`No ${type} records`}
          description="This local database has no matching operational records."
        />
      ) : (
        <>
          <DataTable
            caption={`${type} records`}
            headers={['Record', 'Status or action', 'Details', 'Time']}
          >
            {resource.data.data.map((item) => {
              if ('file_name' in item)
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/imports/${item.id}`}>{item.file_name}</Link>
                    </td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      {item.valid_rows} valid · {item.invalid_rows} invalid
                    </td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                );
              if ('source_name' in item)
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/ingestion-runs/${item.id}`}>{item.source_name}</Link>
                    </td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>
                      {item.imported_count} imported · {item.failed_count} failed
                    </td>
                    <td>{new Date(item.started_at).toLocaleString()}</td>
                  </tr>
                );
              if ('version' in item)
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/releases/${item.id}`}>{item.version}</Link>
                    </td>
                    <td>
                      <StatusBadge value={item.release_status} />
                    </td>
                    <td>{item.record_count} records</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                );
              if ('action_type' in item)
                return (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/approvals/${item.id}`}>{item.action_type}</Link>
                    </td>
                    <td>
                      <StatusBadge value={item.status} />
                    </td>
                    <td>{item.requested_by}</td>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                  </tr>
                );
              return (
                <tr key={item.id}>
                  <td>
                    <Link to={`/audit-logs/${item.id}`}>{item.action}</Link>
                  </td>
                  <td>{item.actor_identifier}</td>
                  <td>
                    {item.entity_type}
                    {item.entity_id ? ` · ${item.entity_id}` : ''}
                  </td>
                  <td>{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
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

function ReleaseCreate({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await adminApi.post(
      '/api/admin/v1/releases',
      { version: formText(data, 'version'), reason: formText(data, 'reason') },
      dataEnvelopeSchema(releaseSchema),
    );
    setOpen(false);
    onCreated();
  };
  return open ? (
    <form className="compact-create" onSubmit={(event) => void create(event)}>
      <input required name="version" placeholder="2026.07-demo" aria-label="Release version" />
      <input
        required
        minLength={3}
        name="reason"
        placeholder="Release reason"
        aria-label="Release reason"
      />
      <button className="primary-button">Create draft</button>
      <button className="text-button" type="button" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  ) : (
    <button className="primary-button" onClick={() => setOpen(true)}>
      Create release
    </button>
  );
}

function ImportDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/imports/${id}`, importDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading import preview…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const { batch, errors } = resource.data.data;
  const commit = async () => {
    await adminApi.post(
      '/api/admin/v1/imports/commit',
      { import_id: batch.id, checksum: batch.checksum },
      dataEnvelopeSchema(z.unknown()),
    );
    setMessage('Import committed. Repeating this checksum is idempotent.');
    setConfirm(false);
    retry();
  };
  return (
    <>
      <PageHeader title={batch.file_name} description="Import dry-run and commit summary" />
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      <div className="record-summary">
        <div>
          <span>Status</span>
          <StatusBadge value={batch.status} />
        </div>
        <div>
          <span>Valid</span>
          <strong>{batch.valid_rows}</strong>
        </div>
        <div>
          <span>Invalid</span>
          <strong>{batch.invalid_rows}</strong>
        </div>
        <div>
          <span>Duplicates</span>
          <strong>{batch.duplicate_rows}</strong>
        </div>
      </div>
      <section className="panel">
        <h2>Validation messages</h2>
        {errors.length ? (
          <DataTable
            caption="Import validation messages"
            headers={['Row', 'Field', 'Code', 'Message']}
          >
            {errors.map((item) => (
              <tr key={item.id}>
                <td>{item.row_number}</td>
                <td>{item.field_name ?? 'record'}</td>
                <td>
                  <StatusBadge value={item.error_code} />
                </td>
                <td>{item.error_message}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No validation errors"
            description="The validated records may be committed after reviewing warnings and the checksum."
          />
        )}
        <code className="checksum">{batch.checksum}</code>
      </section>
      <button
        className="primary-button"
        disabled={batch.invalid_rows > 0 || batch.status === 'completed'}
        onClick={() => setConfirm(true)}
      >
        Commit validated import
      </button>
      <ConfirmationDialog
        open={confirm}
        title="Commit this import?"
        description="The validated payload and checksum will be applied transactionally. Critical hard-reserved handles are routed to approval."
        confirmLabel="Commit import"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void commit()}
      />
    </>
  );
}

function ReleaseDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/releases/${id}`, releaseDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [action, setAction] = useState<
    'calculate' | 'request-approval' | 'approve' | 'publish' | 'withdraw' | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading release…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const data = resource.data.data;
  const apply = async () => {
    if (!action) return;
    try {
      await adminApi.post(
        `/api/admin/v1/releases/${id}/${action}`,
        { reason: `Registry release ${action} reviewed in the administration application.` },
        dataEnvelopeSchema(z.unknown()),
      );
      setMessage(`Release ${action} step completed.`);
      setAction(null);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setAction(null);
    }
  };
  return (
    <>
      <PageHeader
        title={`Release ${data.release.version}`}
        description="Versioned Registry snapshot and publication workflow"
      />
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <div className="environment-banner">
        <strong>Demonstration data warning</strong>
        <span>{data.demonstration_data_warning}</span>
      </div>
      <div className="record-summary">
        <div>
          <span>Status</span>
          <StatusBadge value={data.release.release_status} />
        </div>
        <div>
          <span>Records</span>
          <strong>{data.release.record_count}</strong>
        </div>
        <div>
          <span>Checksum</span>
          <code>{data.release.checksum}</code>
        </div>
      </div>
      <section className="panel">
        <h2>Two-person publication</h2>
        <p>
          Calculate freezes the reviewed snapshot. The requester cannot approve their own
          publication request, and publish revalidates the approved checksum.
        </p>
        <div className="form-actions">
          <button className="secondary-button" onClick={() => setAction('calculate')}>
            Calculate snapshot
          </button>
          <button className="secondary-button" onClick={() => setAction('request-approval')}>
            Request approval
          </button>
          <button className="secondary-button" onClick={() => setAction('approve')}>
            Approve as second admin
          </button>
          <button className="primary-button" onClick={() => setAction('publish')}>
            Publish approved release
          </button>
          <button className="danger-button" onClick={() => setAction('withdraw')}>
            Withdraw
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Approval requests</h2>
        {data.approval_requests.length ? (
          data.approval_requests.map((approval) => (
            <Link className="record-link" key={approval.id} to={`/approvals/${approval.id}`}>
              <span>{approval.action_type}</span>
              <StatusBadge value={approval.status} />
            </Link>
          ))
        ) : (
          <p className="muted-copy">No publication approval has been requested.</p>
        )}
      </section>
      <ConfirmationDialog
        open={Boolean(action)}
        title={`${action ?? 'Change'} release?`}
        description="This release operation is audited. Publication requires an independent approval and unchanged snapshot checksum."
        confirmLabel={`Confirm ${action ?? 'change'}`}
        onCancel={() => setAction(null)}
        onConfirm={() => void apply()}
      />
    </>
  );
}

function ApprovalDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/approval-requests/${id}`, approvalDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading approval request…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const approval = resource.data.data.approval;
  const apply = async () => {
    if (!action) return;
    try {
      await adminApi.post(
        `/api/admin/v1/approval-requests/${id}/${action}`,
        { reason: `Independent ${action} decision after reviewing the intended change.` },
        dataEnvelopeSchema(z.unknown()),
      );
      setAction(null);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setAction(null);
    }
  };
  return (
    <>
      <PageHeader title={approval.action_type} description="Sensitive-change approval request" />
      {error ? <Feedback kind="error">{error.message}</Feedback> : null}
      <div className="record-summary">
        <div>
          <span>Status</span>
          <StatusBadge value={approval.status} />
        </div>
        <div>
          <span>Requester</span>
          <strong>{approval.requested_by}</strong>
        </div>
        <div>
          <span>Approvals</span>
          <strong>
            {approval.approval_count}/{approval.required_approvals}
          </strong>
        </div>
        <div>
          <span>Expires</span>
          <strong>{new Date(approval.expires_at).toLocaleString()}</strong>
        </div>
      </div>
      <section className="panel">
        <h2>Intended change</h2>
        <p>{approval.reason}</p>
        <pre className="json-view">{JSON.stringify(approval.requested_payload, null, 2)}</pre>
      </section>
      <div className="form-actions">
        <button
          className="primary-button"
          disabled={approval.status !== 'pending'}
          onClick={() => setAction('approve')}
        >
          Approve independently
        </button>
        <button
          className="danger-button"
          disabled={approval.status !== 'pending'}
          onClick={() => setAction('reject')}
        >
          Reject request
        </button>
      </div>
      <ConfirmationDialog
        open={Boolean(action)}
        title={`${action ?? 'Review'} sensitive change?`}
        description="Self-approval and replay are rejected by the server. The full decision is written to the append-only audit log."
        confirmLabel={`Confirm ${action ?? 'decision'}`}
        onCancel={() => setAction(null)}
        onConfirm={() => void apply()}
      />
    </>
  );
}

function SimpleDetail({ type, id }: { type: 'ingestion' | 'audits'; id: string }) {
  return type === 'ingestion' ? <IngestionDetail id={id} /> : <AuditDetail id={id} />;
}

const ingestionDetailSchema = dataEnvelopeSchema(
  z.object({
    run: ingestionRunSchema,
    records: z.array(
      z.object({
        id: z.string(),
        source_record_id: z.string().nullable(),
        outcome_status: z.string(),
        candidate_id: z.string().nullable(),
        retry_count: z.number(),
        error_code: z.string().nullable(),
        error_message: z.string().nullable(),
        created_at: z.string(),
      }),
    ),
  }),
);
function IngestionDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/ingestion-runs/${id}`, ingestionDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  if (resource.status === 'loading') return <LoadingState label="Loading record…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const { run, records } = resource.data.data;
  return (
    <>
      <PageHeader
        title={`${run.source_name} ingestion run`}
        description="Bounded processing status, checkpoint, and per-record outcomes"
      />
      <div className="record-summary">
        <div>
          <span>Status</span>
          <StatusBadge value={run.status} />
        </div>
        <div>
          <span>Trigger</span>
          <strong>{run.trigger_type}</strong>
        </div>
        <div>
          <span>Fetched</span>
          <strong>{run.fetched_count}</strong>
        </div>
        <div>
          <span>Created / updated</span>
          <strong>
            {run.imported_count} / {run.updated_count}
          </strong>
        </div>
        <div>
          <span>Duplicates / failed</span>
          <strong>
            {run.duplicate_count} / {run.failed_count}
          </strong>
        </div>
        <div>
          <span>Retries</span>
          <strong>{run.retry_count}</strong>
        </div>
      </div>
      <section className="panel">
        <h2>Checkpoint</h2>
        <pre className="json-view">
          {JSON.stringify({ before: run.checkpoint_before, after: run.checkpoint_after }, null, 2)}
        </pre>
      </section>
      <section className="panel">
        <h2>Record outcomes</h2>
        {records.length ? (
          <DataTable
            caption="Ingestion record outcomes"
            headers={['Source record', 'Outcome', 'Candidate', 'Error']}
          >
            {records.map((record) => (
              <tr key={record.id}>
                <td>{record.source_record_id ?? 'Unknown'}</td>
                <td>
                  <StatusBadge value={record.outcome_status} />
                </td>
                <td>
                  {record.candidate_id ? (
                    <Link to={`/candidates/${record.candidate_id}`}>{record.candidate_id}</Link>
                  ) : (
                    'None'
                  )}
                </td>
                <td>{record.error_message ?? 'None'}</td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No record outcomes"
            description="This run did not process source records."
          />
        )}
      </section>
    </>
  );
}

const auditDetailSchema = dataEnvelopeSchema(auditSchema);
function AuditDetail({ id }: { id: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/audit-logs/${id}`, auditDetailSchema, signal),
    [id],
  );
  const { resource, retry } = useAdminResource(load, id);
  if (resource.status === 'loading') return <LoadingState label="Loading audit event…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  return (
    <>
      <PageHeader title="Audit event" description="Append-only administrative evidence" />
      <pre className="json-view panel">{JSON.stringify(resource.data.data, null, 2)}</pre>
    </>
  );
}

function Settings() {
  const { identity, switchLocalIdentity } = useAdminIdentity();
  const [message, setMessage] = useState<string | null>(null);
  const change = async (slot: 'primary' | 'secondary') => {
    await switchLocalIdentity(slot);
    setMessage(`Local identity switched to the ${slot} configured administrator.`);
  };
  return (
    <>
      <PageHeader
        title="Administration settings"
        description="Authenticated identity, authorization, and private API documentation."
      />
      {message ? <Feedback kind="success">{message}</Feedback> : null}
      <section className="panel">
        <h2>Current identity</h2>
        <dl className="definition-grid">
          <div>
            <dt>Name</dt>
            <dd>{identity.display_name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{identity.email}</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>{identity.authentication_source}</dd>
          </div>
          <div>
            <dt>Roles</dt>
            <dd>{identity.roles.join(', ')}</dd>
          </div>
        </dl>
        <div className="form-actions">
          <button className="secondary-button" onClick={() => void change('primary')}>
            Use primary local admin
          </button>
          <button className="secondary-button" onClick={() => void change('secondary')}>
            Use secondary local admin
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Permissions</h2>
        <ul className="permission-list">
          {identity.permissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </section>
      <div className="policy-callout">
        <strong>Production access remains fail closed</strong>
        <p>
          Local identities come only from server-side development variables. Production
          configuration denies all access until Phase 7 documents and enables verified Cloudflare
          Access JWT authentication.
        </p>
      </div>
      <a className="primary-button inline-button" href="/admin-docs">
        Open private API documentation
      </a>
    </>
  );
}

export default function OperationsPages({
  type,
  mode,
}: {
  type: OperationType;
  mode: 'list' | 'detail';
}) {
  const { recordId } = useParams();
  if (type === 'settings') return <Settings />;
  if (mode === 'list') return <OperationList type={type} />;
  if (!recordId)
    return (
      <EmptyState
        title="Record not found"
        description="The operational record identifier is missing."
      />
    );
  if (type === 'imports') return <ImportDetail id={recordId} />;
  if (type === 'releases') return <ReleaseDetail id={recordId} />;
  if (type === 'approvals') return <ApprovalDetail id={recordId} />;
  return <SimpleDetail type={type} id={recordId} />;
}
