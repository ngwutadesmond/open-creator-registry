import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';

import { adminApi, AdminApiError } from '../api/admin-api-client';
import {
  aliasSchema,
  approvalSchema,
  auditSchema,
  creatorSchema,
  externalProfileSchema,
  dataEnvelopeSchema,
  handleSchema,
  listEnvelopeSchema,
  sourceSchema,
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

const creatorDetailSchema = dataEnvelopeSchema(
  z.object({
    creator: creatorSchema,
    aliases: z.array(aliasSchema),
    sources: z.array(sourceSchema),
    profiles: z.array(externalProfileSchema),
    handles: z.array(handleSchema),
    audit_history: z.array(auditSchema),
    approval_requests: z.array(approvalSchema),
  }),
);

function FormError({ error }: { error: AdminApiError | null }) {
  return error ? (
    <Feedback kind="error">
      {error.message}
      {error.requestId ? ` Request ID: ${error.requestId}` : ''}
    </Feedback>
  ) : null;
}

function CreatorForm({ creatorId }: { creatorId?: string }) {
  const navigate = useNavigate();
  const { can } = useAdminIdentity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [dirty, setDirty] = useState(false);
  const detailLoad = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/creators/${creatorId}`, creatorDetailSchema, signal),
    [creatorId],
  );
  const existing = useAdminResource(detailLoad, creatorId ?? 'new', Boolean(creatorId));
  const creator =
    creatorId && existing.resource.status === 'success'
      ? existing.resource.data.data.creator
      : null;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body = {
        canonical_name: formText(data, 'canonical_name'),
        entity_type: formText(data, 'entity_type'),
        primary_category: formText(data, 'primary_category') || null,
        country_codes: formText(data, 'country_codes')
          .split(',')
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
        biography_summary: formText(data, 'biography_summary') || null,
        notoriety_score: Number(data.get('notoriety_score')),
        protection_tier: formText(data, 'protection_tier'),
        review_status: formText(data, 'review_status'),
        allow_common_name_duplicate: data.get('allow_common_name_duplicate') === 'on',
      };
      const result = creatorId
        ? await adminApi.patch(
            `/api/admin/v1/creators/${creatorId}`,
            body,
            dataEnvelopeSchema(creatorSchema),
          )
        : await adminApi.post('/api/admin/v1/creators', body, dataEnvelopeSchema(creatorSchema));
      setDirty(false);
      void navigate(`/creators/${result.data.id}`, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof AdminApiError
          ? caught
          : new AdminApiError({
              code: 'unexpected_error',
              message: 'The creator could not be saved.',
              status: 0,
            }),
      );
    } finally {
      setBusy(false);
    }
  };

  if (creatorId && existing.resource.status === 'loading')
    return <LoadingState label="Loading creator record…" />;
  if (creatorId && existing.resource.status === 'error')
    return <ErrorState error={existing.resource.error} onRetry={existing.retry} />;
  return (
    <>
      <PageHeader
        title={creator ? `Edit ${creator.canonical_name}` : 'Create creator'}
        description="Identity evidence and protection decisions remain separate, reviewable records."
        actions={
          creator ? (
            <Link className="secondary-button" to={`/creators/${creator.id}`}>
              Cancel editing
            </Link>
          ) : undefined
        }
      />
      {dirty ? <Feedback kind="info">You have unsaved creator changes.</Feedback> : null}
      <form
        className="admin-form panel"
        onSubmit={(event) => void submit(event)}
        onChange={() => setDirty(true)}
      >
        <div className="form-grid">
          <label>
            Canonical name
            <input
              required
              minLength={2}
              name="canonical_name"
              defaultValue={creator?.canonical_name}
            />
          </label>
          <label>
            Entity type
            <input
              required
              minLength={2}
              name="entity_type"
              defaultValue={creator?.entity_type ?? 'person'}
            />
          </label>
          <label>
            Primary category
            <input name="primary_category" defaultValue={creator?.primary_category ?? ''} />
          </label>
          <label>
            Country codes
            <input
              name="country_codes"
              placeholder="US, GB"
              defaultValue={creator?.country_codes?.join(', ') ?? ''}
            />
          </label>
          <label>
            Notoriety score
            <input
              required
              min={0}
              max={100}
              type="number"
              name="notoriety_score"
              defaultValue={creator?.notoriety_score ?? 50}
            />
          </label>
          <label>
            Protection tier
            <select name="protection_tier" defaultValue={creator?.protection_tier ?? 'standard'}>
              <option value="critical">Critical</option>
              <option value="notable">Notable</option>
              <option value="watchlist">Watchlist</option>
              <option value="standard">Standard</option>
            </select>
          </label>
          <label>
            Review status
            <select name="review_status" defaultValue={creator?.review_status ?? 'pending'}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="disputed">Disputed</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="full-field">
            Biography summary
            <textarea
              name="biography_summary"
              rows={5}
              maxLength={2000}
              defaultValue={creator?.biography_summary ?? ''}
            />
          </label>
        </div>
        <label className="checkbox-field">
          <input type="checkbox" name="allow_common_name_duplicate" /> I reviewed the common-name
          warning and intend to create this distinct identity.
        </label>
        <FormError error={error} />
        <div className="form-actions">
          <button
            className="primary-button"
            disabled={busy || !can('creators:write')}
            type="submit"
          >
            {busy ? 'Saving…' : 'Save creator'}
          </button>
        </div>
      </form>
    </>
  );
}

function ProfileFields({ profile }: { profile?: z.infer<typeof externalProfileSchema> }) {
  return (
    <>
      <label>
        Platform
        <select name="platform" defaultValue={profile?.platform ?? 'youtube'}>
          {[
            'youtube',
            'spotify',
            'tiktok',
            'instagram',
            'x',
            'facebook',
            'twitch',
            'soundcloud',
            'apple_music',
            'official_website',
            'other',
          ].map((platform) => (
            <option key={platform} value={platform}>
              {platform.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        Stable account ID
        <input name="platform_account_id" defaultValue={profile?.platform_account_id ?? ''} />
      </label>
      <label>
        Handle
        <input name="platform_handle" defaultValue={profile?.platform_handle ?? ''} />
      </label>
      <label>
        HTTPS profile URL
        <input name="profile_url" type="url" defaultValue={profile?.profile_url ?? ''} />
      </label>
      <label>
        Profile name
        <input name="profile_name" defaultValue={profile?.profile_name ?? ''} />
      </label>
      <label>
        Verification
        <select
          name="verification_status"
          defaultValue={profile?.verification_status ?? 'unverified'}
        >
          <option value="unverified">Unverified</option>
          <option value="source_linked">Source linked</option>
          <option value="cross_source_confirmed">Cross-source confirmed</option>
          <option value="manually_verified">Manually verified</option>
          <option value="creator_verified">Creator verified</option>
          <option value="stale">Stale</option>
          <option value="disputed">Disputed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label>
        Visibility
        <select name="visibility_status" defaultValue={profile?.visibility_status ?? 'private'}>
          <option value="public">Public</option>
          <option value="private">Private</option>
          <option value="suppressed">Suppressed</option>
        </select>
      </label>
      <label>
        Profile provenance label
        <input required name="source_name" defaultValue={profile?.source_name ?? ''} />
      </label>
      <label>
        Profile provenance reference
        <input name="source_reference" defaultValue={profile?.source_reference ?? ''} />
      </label>
      <label>
        Profile provenance license
        <input name="source_license" defaultValue={profile?.source_license ?? ''} />
      </label>
      <label>
        Confidence
        <input
          name="confidence_score"
          type="number"
          min={0}
          max={100}
          defaultValue={profile?.confidence_score ?? 80}
        />
      </label>
      <label className="checkbox-label">
        <input name="is_primary" type="checkbox" defaultChecked={profile?.is_primary ?? false} />
        Primary profile for this platform
      </label>
      <label className="full-field">
        Change reason
        <input required minLength={3} name="change_reason" />
      </label>
    </>
  );
}

function CreatorDetail({ creatorId }: { creatorId: string }) {
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/creators/${creatorId}`, creatorDetailSchema, signal),
    [creatorId],
  );
  const { resource, retry } = useAdminResource(load, creatorId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    kind: 'alias' | 'source' | 'profile';
    id: string;
    label: string;
  } | null>(null);
  const [editingEvidence, setEditingEvidence] = useState<{
    kind: 'alias' | 'source';
    id: string;
  } | null>(null);
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  if (resource.status === 'loading') return <LoadingState label="Loading creator evidence…" />;
  if (resource.status === 'error') return <ErrorState error={resource.error} onRetry={retry} />;
  const {
    creator,
    aliases,
    sources,
    profiles,
    handles,
    audit_history: audits,
    approval_requests: approvals,
  } = resource.data.data;
  const addAlias = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await adminApi.post(
        `/api/admin/v1/creators/${creatorId}/aliases`,
        {
          alias: formText(data, 'alias'),
          language: formText(data, 'language') || null,
          alias_type: formText(data, 'alias_type'),
          confidence_score: Number(data.get('confidence_score')),
          source_id: formText(data, 'source_id') || null,
        },
        dataEnvelopeSchema(aliasSchema),
      );
      form.reset();
      setFeedback('Alias added.');
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const addSource = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await adminApi.post(
        `/api/admin/v1/creators/${creatorId}/sources`,
        {
          source_name: formText(data, 'source_name'),
          source_entity_id: formText(data, 'source_entity_id'),
          source_url: formText(data, 'source_url') || null,
          source_license: formText(data, 'source_license') || null,
          verification_status: 'pending',
        },
        dataEnvelopeSchema(sourceSchema),
      );
      form.reset();
      setFeedback('Source added.');
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const updateAlias = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await adminApi.patch(
        `/api/admin/v1/aliases/${id}`,
        {
          alias: formText(data, 'alias'),
          language: formText(data, 'language') || null,
          alias_type: formText(data, 'alias_type'),
          confidence_score: Number(data.get('confidence_score')),
          source_id: formText(data, 'source_id') || null,
        },
        dataEnvelopeSchema(aliasSchema),
      );
      setEditingEvidence(null);
      setFeedback('Alias updated and normalized by the server.');
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const updateSource = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const lastCheckedAt = formText(data, 'last_checked_at');
    try {
      await adminApi.patch(
        `/api/admin/v1/sources/${id}`,
        {
          source_url: formText(data, 'source_url') || null,
          source_license: formText(data, 'source_license') || null,
          verification_status: formText(data, 'verification_status'),
          last_checked_at: lastCheckedAt ? new Date(lastCheckedAt).toISOString() : null,
        },
        dataEnvelopeSchema(sourceSchema),
      );
      setEditingEvidence(null);
      setFeedback('Public source updated.');
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const profileBody = (data: FormData) => ({
    platform: formText(data, 'platform'),
    platform_account_id: formText(data, 'platform_account_id') || null,
    platform_handle: formText(data, 'platform_handle') || null,
    profile_url: formText(data, 'profile_url') || null,
    profile_name: formText(data, 'profile_name') || null,
    is_primary: data.get('is_primary') === 'on',
    verification_status: formText(data, 'verification_status'),
    visibility_status: formText(data, 'visibility_status'),
    source_name: formText(data, 'source_name'),
    source_reference: formText(data, 'source_reference') || null,
    source_license: formText(data, 'source_license') || null,
    confidence_score: Number(data.get('confidence_score')),
    change_reason: formText(data, 'change_reason'),
  });
  const addProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await adminApi.post(
        `/api/admin/v1/creators/${creatorId}/profiles`,
        profileBody(new FormData(form)),
        dataEnvelopeSchema(z.unknown()),
      );
      form.reset();
      setFeedback(
        creator.protection_tier === 'critical'
          ? 'Critical profile change sent to the approval queue.'
          : 'Platform profile added.',
      );
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const updateProfile = async (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    try {
      await adminApi.patch(
        `/api/admin/v1/external-profiles/${id}`,
        profileBody(new FormData(event.currentTarget)),
        dataEnvelopeSchema(z.unknown()),
      );
      setEditingProfile(null);
      setFeedback(
        creator.protection_tier === 'critical'
          ? 'Critical profile change sent to the approval queue.'
          : 'Platform profile updated.',
      );
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
    }
  };
  const removeEvidence = async () => {
    if (!confirmDelete) return;
    try {
      const path =
        confirmDelete.kind === 'alias'
          ? `aliases/${confirmDelete.id}`
          : confirmDelete.kind === 'source'
            ? `sources/${confirmDelete.id}`
            : `external-profiles/${confirmDelete.id}`;
      await adminApi.delete(`/api/admin/v1/${path}`);
      setFeedback(`${confirmDelete.label} removed.`);
      setConfirmDelete(null);
      retry();
    } catch (caught) {
      setError(caught as AdminApiError);
      setConfirmDelete(null);
    }
  };
  return (
    <>
      <PageHeader
        title={creator.canonical_name}
        description={`${creator.entity_type} · ${creator.primary_category ?? 'Uncategorised'}`}
        actions={
          <>
            <Link className="secondary-button" to={`/handles/new?creator_id=${creator.id}`}>
              Reserve handle
            </Link>
            <Link className="primary-button" to={`/creators/${creator.id}?edit=true`}>
              Edit creator
            </Link>
          </>
        }
      />
      {feedback ? <Feedback kind="success">{feedback}</Feedback> : null}
      <FormError error={error} />
      <div className="record-summary">
        <div>
          <span>Protection tier</span>
          <StatusBadge value={creator.protection_tier} />
        </div>
        <div>
          <span>Review status</span>
          <StatusBadge value={creator.review_status} />
        </div>
        <div>
          <span>Notoriety</span>
          <strong>{creator.notoriety_score}/100</strong>
        </div>
        <div>
          <span>Countries</span>
          <strong>{creator.country_codes?.join(', ') || 'Not specified'}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Aliases</h2>
          <p>Aliases are match evidence, not identity proof.</p>
        </div>
        {aliases.length ? (
          <DataTable
            caption="Creator aliases"
            headers={['Alias', 'Normalized signal', 'Type', 'Confidence', 'Actions']}
          >
            {aliases.map((item) => (
              <tr key={item.id}>
                <td>{item.alias}</td>
                <td>
                  <code>{item.normalized_alias}</code>
                  <small>Skeleton: {item.confusable_skeleton}</small>
                </td>
                <td>
                  <StatusBadge value={item.alias_type} />
                </td>
                <td>{item.confidence_score}%</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setEditingEvidence({ kind: 'alias', id: item.id })}
                  >
                    Edit
                  </button>{' '}
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      setConfirmDelete({ kind: 'alias', id: item.id, label: item.alias })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No aliases"
            description="Add reviewed names or official handle aliases below."
          />
        )}
        {editingEvidence?.kind === 'alias'
          ? (() => {
              const item = aliases.find((alias) => alias.id === editingEvidence.id);
              return item ? (
                <form
                  className="inline-form evidence-editor"
                  onSubmit={(event) => void updateAlias(event, item.id)}
                >
                  <label>
                    Alias
                    <input required minLength={2} name="alias" defaultValue={item.alias} />
                  </label>
                  <label>
                    Type
                    <select name="alias_type" defaultValue={item.alias_type}>
                      <option value="canonical">Canonical</option>
                      <option value="stage_name">Stage name</option>
                      <option value="former_name">Former name</option>
                      <option value="transliteration">Transliteration</option>
                      <option value="official_handle">Official handle</option>
                      <option value="protected_variant">Protected variant</option>
                      <option value="known_alias">Known alias</option>
                    </select>
                  </label>
                  <label>
                    Language
                    <input name="language" defaultValue={item.language ?? ''} />
                  </label>
                  <label>
                    Confidence
                    <input
                      name="confidence_score"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={item.confidence_score}
                    />
                  </label>
                  <label>
                    Public source
                    <select name="source_id" defaultValue={item.source_id ?? ''}>
                      <option value="">No linked source</option>
                      {sources.map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.source_name} · {source.source_entity_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="secondary-button" type="submit">
                    Save alias
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setEditingEvidence(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : null;
            })()
          : null}
        <form className="inline-form" onSubmit={(event) => void addAlias(event)}>
          <label>
            Alias
            <input required minLength={2} name="alias" />
          </label>
          <label>
            Type
            <select name="alias_type">
              <option value="known_alias">Known alias</option>
              <option value="official_handle">Official handle</option>
              <option value="stage_name">Stage name</option>
              <option value="protected_variant">Protected variant</option>
            </select>
          </label>
          <label>
            Language
            <input name="language" placeholder="en" />
          </label>
          <label>
            Confidence
            <input name="confidence_score" type="number" min={0} max={100} defaultValue={80} />
          </label>
          <label>
            Public source
            <select name="source_id">
              <option value="">No linked source</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.source_name} · {source.source_entity_id}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button" type="submit">
            Add alias
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>External sources</h2>
          <p>Evidence provenance stays reviewable and removable.</p>
        </div>
        {sources.length ? (
          <DataTable
            caption="Creator sources"
            headers={['Source', 'External ID', 'Verification', 'Actions']}
          >
            {sources.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.source_url ? (
                    <a href={item.source_url} rel="noreferrer" target="_blank">
                      {item.source_name}
                    </a>
                  ) : (
                    item.source_name
                  )}
                </td>
                <td>{item.source_entity_id}</td>
                <td>
                  <StatusBadge value={item.verification_status} />
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => setEditingEvidence({ kind: 'source', id: item.id })}
                  >
                    Edit
                  </button>{' '}
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      setConfirmDelete({ kind: 'source', id: item.id, label: item.source_name })
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No external sources"
            description="Add public evidence without storing private personal information."
          />
        )}
        {editingEvidence?.kind === 'source'
          ? (() => {
              const item = sources.find((source) => source.id === editingEvidence.id);
              return item ? (
                <form
                  className="inline-form evidence-editor"
                  onSubmit={(event) => void updateSource(event, item.id)}
                >
                  <label>
                    Public URL
                    <input name="source_url" type="url" defaultValue={item.source_url ?? ''} />
                  </label>
                  <label>
                    License
                    <input name="source_license" defaultValue={item.source_license ?? ''} />
                  </label>
                  <label>
                    Verification
                    <select name="verification_status" defaultValue={item.verification_status}>
                      <option value="pending">Pending</option>
                      <option value="verified">Verified</option>
                      <option value="rejected">Rejected</option>
                      <option value="stale">Stale</option>
                    </select>
                  </label>
                  <label>
                    Last checked
                    <input
                      name="last_checked_at"
                      type="datetime-local"
                      defaultValue={item.last_checked_at?.slice(0, 16) ?? ''}
                    />
                  </label>
                  <button className="secondary-button" type="submit">
                    Save source
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setEditingEvidence(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : null;
            })()
          : null}
        <form className="inline-form" onSubmit={(event) => void addSource(event)}>
          <label>
            Source name
            <input required name="source_name" />
          </label>
          <label>
            External ID
            <input required name="source_entity_id" />
          </label>
          <label>
            Public URL
            <input name="source_url" type="url" />
          </label>
          <label>
            License
            <input name="source_license" />
          </label>
          <button className="secondary-button" type="submit">
            Add source
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Platform profiles</h2>
          <p>
            Review public associations, provenance, visibility, and conflicts. Source-linked does
            not prove account control.
          </p>
        </div>
        {profiles.length ? (
          <DataTable
            caption="Creator platform profiles"
            headers={['Platform', 'Account', 'Verification', 'Visibility', 'Source', 'Actions']}
          >
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td>
                  {profile.profile_url ? (
                    <a href={profile.profile_url} target="_blank" rel="noopener noreferrer">
                      {profile.platform}
                    </a>
                  ) : (
                    profile.platform
                  )}
                  {profile.is_primary ? <small>Primary</small> : null}
                </td>
                <td>{profile.platform_handle ?? profile.platform_account_id ?? 'URL only'}</td>
                <td>
                  <StatusBadge value={profile.verification_status} />
                </td>
                <td>
                  <StatusBadge value={profile.visibility_status} />
                </td>
                <td>
                  {profile.source_name}
                  <small>{profile.source_reference ?? 'No source reference'}</small>
                </td>
                <td>
                  <button className="text-button" onClick={() => setEditingProfile(profile.id)}>
                    Edit
                  </button>{' '}
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      setConfirmDelete({
                        kind: 'profile',
                        id: profile.id,
                        label: `${profile.platform} profile`,
                      })
                    }
                  >
                    Suppress
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No platform profiles"
            description="This creator has no reviewed external profile associations."
          />
        )}
        {editingProfile
          ? (() => {
              const profile = profiles.find((item) => item.id === editingProfile);
              return profile ? (
                <form
                  className="inline-form evidence-editor"
                  onSubmit={(event) => void updateProfile(event, profile.id)}
                >
                  <ProfileFields profile={profile} />
                  <button className="secondary-button">Save profile</button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setEditingProfile(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : null;
            })()
          : null}
        <form
          aria-label="Add platform profile"
          className="inline-form"
          onSubmit={(event) => void addProfile(event)}
        >
          <ProfileFields />
          <button className="secondary-button">Add platform profile</button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Reserved handles</h2>
          <Link to={`/handles/new?creator_id=${creator.id}`}>Add handle</Link>
        </div>
        {handles.length ? (
          <DataTable caption="Creator handles" headers={['Handle', 'Classification', 'Status']}>
            {handles.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link to={`/handles/${item.id}`}>@{item.normalized_handle}</Link>
                </td>
                <td>
                  <StatusBadge value={item.classification} />
                </td>
                <td>
                  <StatusBadge value={item.status} />
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <EmptyState
            title="No protected handles"
            description="No live registration decision is associated with this creator."
          />
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Approval requests</h2>
            <p>
              Critical intended changes remain separate until a different administrator decides.
            </p>
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
          <p className="muted-copy">No approval requests are associated with this creator.</p>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Record history</h2>
            <p>Append-only administrative actions for this creator.</p>
          </div>
          <Link to={`/audit-logs?entity_id=${creator.id}`}>Open audit explorer</Link>
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
      <ConfirmationDialog
        open={Boolean(confirmDelete)}
        title="Delete evidence record?"
        description={`Removing ${confirmDelete?.label ?? 'this record'} can change future matching evidence. The audit entry remains append-only.`}
        confirmLabel="Delete record"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => void removeEvidence()}
      />
    </>
  );
}

function CreatorList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const key = searchParams.toString();
  const load = useCallback(
    (signal: AbortSignal) =>
      adminApi.get(`/api/admin/v1/creators?${key}`, listEnvelopeSchema(creatorSchema), signal),
    [key],
  );
  const { resource, retry } = useAdminResource(load, key);
  const filters = useMemo(
    () => ({
      query: searchParams.get('query') ?? '',
      protection_tier: searchParams.get('protection_tier') ?? '',
      review_status: searchParams.get('review_status') ?? '',
      category: searchParams.get('category') ?? '',
      country: searchParams.get('country') ?? '',
      sort: searchParams.get('sort') ?? 'updated_at',
      order: searchParams.get('order') ?? 'desc',
    }),
    [searchParams],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSearchParams(
      [...data.entries()]
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
        )
        .map(([name, value]): [string, string] => [
          name,
          name === 'country' ? value.toUpperCase() : value,
        ]),
    );
  };
  const changePage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
  };
  return (
    <>
      <PageHeader
        title="Creators"
        description="Search and manage reviewed creator identity records."
        actions={
          <Link className="primary-button" to="/creators/new">
            Create creator
          </Link>
        }
      />
      <form className="filter-bar" onSubmit={submit}>
        <label>
          Search
          <input name="query" defaultValue={filters.query} placeholder="Name or normalized name" />
        </label>
        <label>
          Tier
          <select name="protection_tier" defaultValue={filters.protection_tier}>
            <option value="">All tiers</option>
            <option value="critical">Critical</option>
            <option value="notable">Notable</option>
            <option value="watchlist">Watchlist</option>
            <option value="standard">Standard</option>
          </select>
        </label>
        <label>
          Status
          <select name="review_status" defaultValue={filters.review_status}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="disputed">Disputed</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label>
          Category
          <input name="category" defaultValue={filters.category} placeholder="Music" />
        </label>
        <label>
          Country
          <input
            name="country"
            defaultValue={filters.country}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            placeholder="US"
          />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={filters.sort}>
            <option value="updated_at">Last updated</option>
            <option value="canonical_name">Creator name</option>
            <option value="notoriety_score">Notoriety</option>
            <option value="created_at">Created</option>
          </select>
        </label>
        <label>
          Order
          <select name="order" defaultValue={filters.order}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </label>
        <button className="secondary-button" type="submit">
          Apply filters
        </button>
      </form>
      {resource.status === 'loading' ? (
        <LoadingState label="Loading creators…" />
      ) : resource.status === 'error' ? (
        <ErrorState error={resource.error} onRetry={retry} />
      ) : resource.data.data.length === 0 ? (
        <EmptyState
          title="No creators found"
          description="Adjust the filters or create a reviewed creator record."
          action={
            <Link className="primary-button" to="/creators/new">
              Create creator
            </Link>
          }
        />
      ) : (
        <>
          <DataTable
            caption="Creator Registry administration results"
            headers={['Creator', 'Category', 'Countries', 'Tier', 'Review']}
          >
            {resource.data.data.map((creator) => (
              <tr key={creator.id}>
                <td>
                  <Link to={`/creators/${creator.id}`}>{creator.canonical_name}</Link>
                  <small>{creator.entity_type}</small>
                </td>
                <td>{creator.primary_category ?? '—'}</td>
                <td>{creator.country_codes?.join(', ') ?? '—'}</td>
                <td>
                  <StatusBadge value={creator.protection_tier} />
                </td>
                <td>
                  <StatusBadge value={creator.review_status} />
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

export default function CreatorsPages({ mode }: { mode: 'list' | 'new' | 'detail' }) {
  const { creatorId } = useParams();
  const [searchParams] = useSearchParams();
  if (mode === 'list') return <CreatorList />;
  if (mode === 'new') return <CreatorForm />;
  if (!creatorId)
    return (
      <EmptyState title="Creator not found" description="The creator identifier is missing." />
    );
  return searchParams.get('edit') === 'true' ? (
    <CreatorForm creatorId={creatorId} />
  ) : (
    <CreatorDetail creatorId={creatorId} />
  );
}
