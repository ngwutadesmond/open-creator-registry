import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { PublicApiError, publicApi } from '../api/public-api-client';
import type { PublicAlias, PublicCreatorDetail, PublicHandle } from '../api/schemas';
import { ClassificationBadge } from '../components/Classification';
import { Disclaimer } from '../components/Disclaimer';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncStates';
import { formatCountry, formatDateTime, formatLabel, safeExternalUrl } from '../utils/format';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type DetailState = {
  key: string;
  aliases: PublicAlias[] | null;
  aliasesError: PublicApiError | null;
  creator: PublicCreatorDetail | null;
  creatorError: PublicApiError | null;
  handles: PublicHandle[] | null;
  handlesError: PublicApiError | null;
  loading: boolean;
};

const initialState: DetailState = {
  key: '',
  aliases: null,
  aliasesError: null,
  creator: null,
  creatorError: null,
  handles: null,
  handlesError: null,
  loading: true,
};

function toApiError(error: unknown, message: string) {
  return error instanceof PublicApiError
    ? error
    : new PublicApiError({ code: 'unexpected_error', message, status: 0 });
}

export default function CreatorDetailPage() {
  const { creatorId = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>(initialState);
  const requestKey = `${creatorId}:${attempt}`;
  const loading = state.key !== requestKey;
  useDocumentTitle(!loading && state.creator ? state.creator.canonical_name : 'Creator record');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      publicApi.getCreator(creatorId, controller.signal),
      publicApi.listCreatorHandles(creatorId, controller.signal),
      publicApi.listCreatorAliases(creatorId, controller.signal),
    ]).then(([creator, handles, aliases]) => {
      if (controller.signal.aborted) return;
      setState({
        key: requestKey,
        aliases: aliases.status === 'fulfilled' ? aliases.value.data : null,
        aliasesError:
          aliases.status === 'rejected'
            ? toApiError(aliases.reason, 'Public aliases could not be loaded.')
            : null,
        creator: creator.status === 'fulfilled' ? creator.value.data : null,
        creatorError:
          creator.status === 'rejected'
            ? toApiError(creator.reason, 'The creator record could not be loaded.')
            : null,
        handles: handles.status === 'fulfilled' ? handles.value.data : null,
        handlesError:
          handles.status === 'rejected'
            ? toApiError(handles.reason, 'Protected handles could not be loaded.')
            : null,
        loading: false,
      });
    });
    return () => controller.abort();
  }, [creatorId, requestKey]);

  if (loading) {
    return (
      <div className="page-container">
        <LoadingState label="Loading creator record" />
      </div>
    );
  }

  if (!state.creator) {
    const notFound = state.creatorError?.status === 404;
    return (
      <div className="page-container">
        {notFound ? (
          <EmptyState
            title="Creator record not found"
            description="This creator ID is unknown or is not part of the reviewed public Registry."
            action={
              <Link className="secondary-button" to="/creators">
                Return to creator search
              </Link>
            }
          />
        ) : (
          <ErrorState
            error={
              state.creatorError ?? toApiError(null, 'The creator record could not be loaded.')
            }
            onRetry={() => setAttempt((value) => value + 1)}
          />
        )}
      </div>
    );
  }

  const creator = state.creator;
  return (
    <div className="page-container creator-detail-page">
      <Link className="back-link" to="/creators">
        ← Back to creator explorer
      </Link>
      <header className="creator-detail-header">
        <div>
          <p className="record-type">Public creator record</p>
          <h1>{creator.canonical_name}</h1>
          <p className="creator-biography">
            {creator.biography_summary ?? 'No public biography summary is currently recorded.'}
          </p>
        </div>
        <dl>
          <div>
            <dt>Protection tier</dt>
            <dd>{formatLabel(creator.protection_tier)}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>
              {creator.primary_category ? formatLabel(creator.primary_category) : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt>Countries</dt>
            <dd>
              {creator.country_codes?.length
                ? creator.country_codes.map(formatCountry).join(', ')
                : 'Not recorded'}
            </dd>
          </div>
          <div>
            <dt>Entity type</dt>
            <dd>{formatLabel(creator.entity_type)}</dd>
          </div>
          <div>
            <dt>Registry updated</dt>
            <dd>{formatDateTime(creator.updated_at)}</dd>
          </div>
        </dl>
      </header>

      <div className="detail-sections">
        <section aria-labelledby="creator-handles-title">
          <div className="section-heading section-heading--inline">
            <div>
              <h2 id="creator-handles-title">Protected handles</h2>
              <p>Active public protection decisions associated with this creator.</p>
            </div>
            <Link
              className="secondary-button"
              to={`/check?handle=${encodeURIComponent(creator.canonical_name)}`}
            >
              Check a related handle
            </Link>
          </div>
          {state.handlesError ? (
            <ErrorState error={state.handlesError} title="Handles unavailable" />
          ) : null}
          {state.handles?.length === 0 ? (
            <EmptyState
              title="No public handles"
              description="No active protected handles are currently public."
            />
          ) : null}
          {state.handles?.length ? (
            <div className="handle-records">
              {state.handles.map((handle) => (
                <article key={handle.id}>
                  <div className="handle-records__heading">
                    <h3 className="handle-value">{handle.display_handle}</h3>
                    <ClassificationBadge classification={handle.classification} />
                  </div>
                  <p>{handle.reason_summary}</p>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{formatLabel(handle.status)}</dd>
                    </div>
                    <div>
                      <dt>Confidence signal</dt>
                      <dd>{handle.confidence_score}%</dd>
                    </div>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDateTime(handle.updated_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section aria-labelledby="creator-aliases-title">
          <div className="section-heading">
            <h2 id="creator-aliases-title">Public aliases</h2>
            <p>Verified names and public handle forms used to support Registry matching.</p>
          </div>
          {state.aliasesError ? (
            <ErrorState error={state.aliasesError} title="Aliases unavailable" />
          ) : null}
          {state.aliases?.length === 0 ? (
            <EmptyState
              title="No public aliases"
              description="No verified aliases are currently public."
            />
          ) : null}
          {state.aliases?.length ? (
            <ul className="alias-list">
              {state.aliases.map((alias) => (
                <li key={alias.id}>
                  <span>{alias.alias}</span>
                  <span>{formatLabel(alias.alias_type)}</span>
                  <span>{alias.language?.toUpperCase() ?? 'Language not recorded'}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-labelledby="creator-sources-title">
          <div className="section-heading">
            <h2 id="creator-sources-title">Verified public sources</h2>
            <p>Public provenance attached to this reviewed creator record.</p>
          </div>
          {creator.sources.length === 0 ? (
            <EmptyState
              title="No verified public sources"
              description="No verified source is currently attached to this public record."
            />
          ) : (
            <ul className="source-list">
              {creator.sources.map((source) => {
                const sourceUrl = safeExternalUrl(source.source_url);
                return (
                  <li key={source.id}>
                    <div>
                      <strong>{formatLabel(source.source_name)}</strong>
                      <span className="source-identifier">{source.source_entity_id}</span>
                    </div>
                    <div>
                      {source.source_license ? <span>{source.source_license}</span> : null}
                      {sourceUrl ? (
                        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
                          Open source
                        </a>
                      ) : (
                        <span>No public URL</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      <Disclaimer />
    </div>
  );
}
