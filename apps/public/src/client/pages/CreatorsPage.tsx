import { type FormEvent, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router';

import type { CreatorProtectionTier } from '@open-creator-registry/contracts/domain';

import { publicApi } from '../api/public-api-client';
import { CreatorList } from '../components/CreatorList';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncStates';
import { PageIntro } from '../components/PageIntro';
import { Pagination } from '../components/Pagination';
import { SearchIcon } from '../components/Icons';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const categoryOptions = [
  ['comedy', 'Comedy'],
  ['creator_group', 'Creator group'],
  ['design', 'Design'],
  ['education', 'Education'],
  ['lifestyle', 'Lifestyle'],
  ['music', 'Music'],
  ['streaming', 'Streaming'],
  ['video', 'Video'],
  ['visual_art', 'Visual art'],
] as const;

const countryOptions = [
  ['AU', 'Australia'],
  ['CA', 'Canada'],
  ['ES', 'Spain'],
  ['GB', 'United Kingdom'],
  ['GH', 'Ghana'],
  ['IE', 'Ireland'],
  ['NG', 'Nigeria'],
  ['SE', 'Sweden'],
  ['US', 'United States'],
  ['ZA', 'South Africa'],
] as const;

type SortValue =
  'canonical_name:asc' | 'created_at:desc' | 'notoriety_score:desc' | 'updated_at:desc';

function readPage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default function CreatorsPage() {
  useDocumentTitle('Creator Registry explorer');
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('query') ?? '';
  const category = searchParams.get('category') ?? '';
  const country = searchParams.get('country') ?? '';
  const protectionTier = (searchParams.get('protection_tier') ?? '') as CreatorProtectionTier | '';
  const sort = (searchParams.get('sort') ?? 'canonical_name:asc') as SortValue;
  const page = readPage(searchParams.get('page'));
  const queryInputRef = useRef<HTMLInputElement>(null);

  const loadCreators = useCallback(
    (signal: AbortSignal) => {
      const [sortField, order] = sort.split(':') as [
        'canonical_name' | 'created_at' | 'notoriety_score' | 'updated_at',
        'asc' | 'desc',
      ];
      return publicApi.listCreators(
        {
          category: category || undefined,
          country: country || undefined,
          order,
          page,
          protectionTier: protectionTier || undefined,
          query: query || undefined,
          sort: sortField,
        },
        signal,
      );
    },
    [category, country, page, protectionTier, query, sort],
  );
  const { resource, retry } = useAsyncResource(loadCreators, searchParams.toString());

  function updateParameters(updates: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([key, value]) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
    if (resetPage) next.delete('page');
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParameters({ query: queryInputRef.current?.value.trim() || null });
  }

  function clearFilters() {
    setSearchParams({});
  }

  return (
    <div className="page-container creators-page">
      <PageIntro
        title="Explore public creator records."
        description={
          <p>
            Search reviewed creators by public name, verified alias, protected handle, or source
            identifier. Results are queried from the Registry, not filtered from a static list.
          </p>
        }
      />

      <details className="filter-panel" open>
        <summary>Search and filters</summary>
        <form className="explorer-controls" onSubmit={submitSearch}>
          <div className="explorer-search">
            <label htmlFor="creator-query">Creator, alias, handle, or source identifier</label>
            <div className="search-input-wrap search-input-wrap--compact">
              <SearchIcon />
              <input
                key={query}
                ref={queryInputRef}
                id="creator-query"
                name="query"
                type="search"
                defaultValue={query}
                maxLength={120}
              />
            </div>
          </div>
          <div className="filter-grid">
            <label>
              Category
              <select
                value={category}
                onChange={(event) => updateParameters({ category: event.target.value || null })}
              >
                <option value="">All categories</option>
                {categoryOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Country
              <select
                value={country}
                onChange={(event) => updateParameters({ country: event.target.value || null })}
              >
                <option value="">All countries</option>
                {countryOptions.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Protection tier
              <select
                value={protectionTier}
                onChange={(event) =>
                  updateParameters({ protection_tier: event.target.value || null })
                }
              >
                <option value="">All tiers</option>
                <option value="critical">Critical</option>
                <option value="notable">Notable</option>
                <option value="watchlist">Watchlist</option>
                <option value="standard">Standard</option>
              </select>
            </label>
            <label>
              Sort results
              <select
                value={sort}
                onChange={(event) => updateParameters({ sort: event.target.value || null })}
              >
                <option value="canonical_name:asc">Name A–Z</option>
                <option value="notoriety_score:desc">Protection priority</option>
                <option value="updated_at:desc">Recently updated</option>
                <option value="created_at:desc">Recently added</option>
              </select>
            </label>
          </div>
          <div className="filter-actions">
            <button className="primary-button" type="submit">
              Search Registry
            </button>
            <button className="text-button" type="button" onClick={clearFilters}>
              Clear all
            </button>
          </div>
        </form>
      </details>

      <section
        className="explorer-results"
        aria-labelledby="explorer-results-title"
        aria-busy={resource.status === 'loading'}
      >
        <div className="results-heading">
          <h2 id="explorer-results-title">Creator records</h2>
          {resource.status === 'success' ? (
            <p aria-live="polite">
              {resource.data.pagination.total} public{' '}
              {resource.data.pagination.total === 1 ? 'record' : 'records'}
            </p>
          ) : null}
        </div>
        {resource.status === 'loading' ? <LoadingState label="Loading creator records" /> : null}
        {resource.status === 'error' ? <ErrorState error={resource.error} onRetry={retry} /> : null}
        {resource.status === 'success' && resource.data.data.length === 0 ? (
          <EmptyState
            title="No creator records matched"
            description="Try a broader name, remove a filter, or browse all reviewed public creators."
            action={
              <button className="secondary-button" type="button" onClick={clearFilters}>
                Browse all creators
              </button>
            }
          />
        ) : null}
        {resource.status === 'success' && resource.data.data.length ? (
          <CreatorList creators={resource.data.data} />
        ) : null}
        {resource.status === 'success' ? (
          <Pagination
            pagination={resource.data.pagination}
            onPageChange={(nextPage) =>
              updateParameters({ page: nextPage === 1 ? null : String(nextPage) }, false)
            }
          />
        ) : null}
      </section>
    </div>
  );
}
