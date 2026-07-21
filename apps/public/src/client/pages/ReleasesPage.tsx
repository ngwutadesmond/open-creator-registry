import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';

import { publicApi } from '../api/public-api-client';
import { Disclaimer } from '../components/Disclaimer';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncStates';
import { PageIntro } from '../components/PageIntro';
import { Pagination } from '../components/Pagination';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatDate, formatDateTime } from '../utils/format';

function readPage(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default function ReleasesPage() {
  useDocumentTitle('Registry releases');
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams.get('page'));
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [meta, releases] = await Promise.all([
        publicApi.getRegistryMeta(signal),
        publicApi.listReleases(page, signal),
      ]);
      return { meta, releases };
    },
    [page],
  );
  const { resource, retry } = useAsyncResource(load, `page-${page}`);

  return (
    <div className="page-container releases-page">
      <PageIntro
        title="Registry releases and data state."
        description={
          <p>
            Published releases identify versioned Registry decision points. They do not change the
            public API version or establish ownership rights.
          </p>
        }
      />
      {resource.status === 'loading' ? <LoadingState label="Loading Registry releases" /> : null}
      {resource.status === 'error' ? <ErrorState error={resource.error} onRetry={retry} /> : null}
      {resource.status === 'success' ? (
        <>
          <section className="release-summary" aria-labelledby="current-release-title">
            <div>
              <h2 id="current-release-title">Current Registry state</h2>
              <p className="release-version">
                {resource.data.meta.data.current_registry_version ??
                  'Unversioned development state'}
              </p>
              <p>
                {resource.data.meta.data.current_registry_version
                  ? `Published ${formatDate(resource.data.meta.data.last_published_at)}`
                  : 'No Registry release has been published yet.'}
              </p>
              {resource.data.meta.data.demonstration_data ? (
                <p className="demonstration-notice">
                  This environment contains demonstration records and is not a complete global
                  Registry release.
                </p>
              ) : null}
            </div>
            <dl>
              <div>
                <dt>Approved creators</dt>
                <dd>{resource.data.meta.data.record_counts.approved_creators}</dd>
              </div>
              <div>
                <dt>Active protected handles</dt>
                <dd>{resource.data.meta.data.record_counts.active_reserved_handles}</dd>
              </div>
              <div>
                <dt>Registry updated</dt>
                <dd>{formatDateTime(resource.data.meta.data.last_updated_at)}</dd>
              </div>
            </dl>
          </section>

          <section className="release-history" aria-labelledby="release-history-title">
            <div className="section-heading">
              <h2 id="release-history-title">Published release history</h2>
              <p>Current and superseded published releases, newest first.</p>
            </div>
            {resource.data.releases.data.length === 0 ? (
              <EmptyState
                title="No published releases"
                description="The local demonstration Registry is truthfully unversioned until an administrator publishes a release in Phase 5."
              />
            ) : (
              <div className="release-list">
                {resource.data.releases.data.map((release) => (
                  <article key={release.id}>
                    <div>
                      <h3>{release.version}</h3>
                      <p>Published {formatDate(release.published_at)}</p>
                    </div>
                    <dl>
                      <div>
                        <dt>Records</dt>
                        <dd>{release.record_count}</dd>
                      </div>
                      <div>
                        <dt>Checksum</dt>
                        <dd className="checksum">{release.checksum}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
            <Pagination
              pagination={resource.data.releases.pagination}
              onPageChange={(nextPage) =>
                setSearchParams(nextPage === 1 ? {} : { page: String(nextPage) })
              }
            />
          </section>

          <section className="policy-summary" id="data-source-policy">
            <h2>Data-source policy</h2>
            <p>{resource.data.meta.data.source_policy_summary}</p>
            <Link className="inline-link" to="/about#data-source-policy">
              Read the public data-source principles
            </Link>
          </section>
          <Disclaimer />
        </>
      ) : null}
    </div>
  );
}
