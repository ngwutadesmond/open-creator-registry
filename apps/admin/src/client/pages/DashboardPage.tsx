import { useCallback } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';

import { adminApi } from '../api/admin-api-client';
import { auditSchema, dataEnvelopeSchema, ingestionRunSchema, releaseSchema } from '../api/schemas';
import { DataTable, PageHeader, StatusBadge } from '../components/AdminPrimitives';
import { ErrorState, LoadingState } from '../components/AsyncStates';
import { useAdminResource } from '../hooks/useAdminResource';

const dashboardSchema = dataEnvelopeSchema(
  z.object({
    metrics: z.object({
      approved_creators: z.number(),
      active_handles: z.number(),
      hard_handles: z.number(),
      soft_handles: z.number(),
      monitored_handles: z.number(),
      pending_candidates: z.number(),
      pending_submissions: z.number(),
      pending_approvals: z.number(),
    }),
    latest_release: releaseSchema.nullable(),
    recent_runs: z.array(ingestionRunSchema),
    recent_audits: z.array(auditSchema),
    demonstration_data: z.boolean(),
  }),
);

export default function DashboardPage() {
  const load = useCallback(
    (signal: AbortSignal) => adminApi.get('/api/admin/v1/dashboard', dashboardSchema, signal),
    [],
  );
  const { resource, retry } = useAdminResource(load, 'dashboard');
  if (resource.status === 'loading') return <LoadingState label="Loading registry operations…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const data = resource.data.data;
  const metrics = [
    ['Approved creators', data.metrics.approved_creators, '/creators?review_status=approved'],
    ['Active protected handles', data.metrics.active_handles, '/handles?status=active'],
    ['Hard reserved', data.metrics.hard_handles, '/handles?classification=hard_reserved'],
    ['Soft protected', data.metrics.soft_handles, '/handles?classification=soft_protected'],
    ['Monitored', data.metrics.monitored_handles, '/handles?classification=monitored'],
    ['Pending candidates', data.metrics.pending_candidates, '/candidates?status=pending'],
    ['Pending submissions', data.metrics.pending_submissions, '/submissions?status=pending'],
    ['Pending approvals', data.metrics.pending_approvals, '/approvals?status=pending'],
  ] as const;
  return (
    <>
      <PageHeader
        title="Registry administration"
        description="Manage records, review evidence, and publish versioned Registry decisions."
        actions={
          <Link className="primary-button" to="/creators/new">
            Create creator
          </Link>
        }
      />
      <section className="environment-banner" aria-label="Registry environment">
        <strong>Environment-scoped Registry database</strong>
        <span>No authoritative global release is implied.</span>
        <span>Latest release: {data.latest_release?.version ?? 'Unversioned'}</span>
      </section>
      <section aria-labelledby="metrics-heading">
        <div className="section-heading">
          <h2 id="metrics-heading">Operational metrics</h2>
          <p>Live counts from the bound D1 database.</p>
        </div>
        <div className="metrics-grid">
          {metrics.map(([label, value, href]) => (
            <Link className="dashboard-metric" to={href} key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>View records</small>
            </Link>
          ))}
        </div>
      </section>
      <section className="dashboard-columns">
        <div>
          <div className="section-heading">
            <h2>Recent audit activity</h2>
            <Link to="/audit-logs">View all</Link>
          </div>
          {data.recent_audits.length === 0 ? (
            <p className="muted-copy">No administrative mutations have been logged.</p>
          ) : (
            <DataTable
              caption="Recent audit activity"
              headers={['Action', 'Administrator', 'Entity', 'Time']}
            >
              {data.recent_audits.slice(0, 6).map((audit) => (
                <tr key={audit.id}>
                  <td>
                    <Link to={`/audit-logs/${audit.id}`}>{audit.action}</Link>
                  </td>
                  <td>{audit.actor_identifier}</td>
                  <td>{audit.entity_type}</td>
                  <td>{new Date(audit.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
        <div>
          <div className="section-heading">
            <h2>Recent ingestion runs</h2>
            <Link to="/ingestion-runs">View all</Link>
          </div>
          {data.recent_runs.length === 0 ? (
            <p className="muted-copy">No imports or ingestion runs have executed.</p>
          ) : (
            <ul className="activity-list">
              {data.recent_runs.map((run) => (
                <li key={run.id}>
                  <div>
                    <strong>{run.source_name}</strong>
                    <span>{new Date(run.started_at).toLocaleString()}</span>
                  </div>
                  <StatusBadge value={run.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
