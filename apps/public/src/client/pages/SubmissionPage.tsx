import {
  lazy,
  Suspense,
  type FormEvent,
  type KeyboardEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Link, useSearchParams } from 'react-router';

import type { SubmissionCategory } from '@open-creator-registry/contracts/submissions';

import { PublicApiError, publicApi } from '../api/public-api-client';
import type { SubmissionAcknowledgement } from '../api/schemas';
import { PageIntro } from '../components/PageIntro';
import { CategorySelect } from '../features/submissions/CategorySelect';
import { CountryMultiSelect } from '../features/submissions/CountryMultiSelect';
import { FormField } from '../features/submissions/FormField';
import { RequestedUsernames } from '../features/submissions/RequestedUsernames';
import {
  createEmptySubmissionErrors,
  fieldDescriptionIds,
  type SubmissionDraft,
  type SubmissionErrors,
  validateCategory,
  validateCreatorName,
  validateHandleRows,
  validateSourceRows,
  validateSubmissionDraft,
} from '../features/submissions/submission-form';
import { SubmissionReviewSummary } from '../features/submissions/SubmissionReviewSummary';
import { SupportingSources } from '../features/submissions/SupportingSources';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const BulkSubmissionPanel = lazy(() => import('../features/bulk-submissions/BulkSubmissionPanel'));

type ValidationSummaryItem = {
  message: string;
  targetId: string;
};

function createEmptyDraft(): SubmissionDraft {
  return {
    category: '',
    countryCodes: [],
    creatorName: '',
    handles: [{ id: '1', value: '' }],
    sources: [{ id: '1', value: '' }],
  };
}

function validationSummaryItems(
  errors: SubmissionErrors,
  draft: SubmissionDraft,
): ValidationSummaryItem[] {
  const items: ValidationSummaryItem[] = [];
  if (errors.creatorName) {
    items.push({ message: errors.creatorName, targetId: 'submission-creator-name' });
  }
  if (errors.category) {
    items.push({ message: errors.category, targetId: 'submission-category' });
  }
  if (errors.countryCodes) {
    items.push({ message: errors.countryCodes, targetId: 'submission-country-search' });
  }
  draft.handles.forEach((item) => {
    const message = errors.handles[item.id];
    if (message) items.push({ message, targetId: `submission-handle-${item.id}` });
  });
  draft.sources.forEach((item) => {
    const message = errors.sources[item.id];
    if (message) items.push({ message, targetId: `submission-source-${item.id}` });
  });
  return items;
}

function detailIndex(path: string) {
  const match = path.match(/\.(\d+)(?:\.|$)/u);
  return match?.[1] ? Number(match[1]) : 0;
}

function mapServerErrors(error: PublicApiError, draft: SubmissionDraft): SubmissionErrors {
  const errors = createEmptySubmissionErrors();
  error.details.forEach((detail) => {
    if (detail.path.startsWith('creator_name')) errors.creatorName = detail.message;
    if (detail.path.startsWith('category')) errors.category = detail.message;
    if (detail.path.startsWith('country_codes')) errors.countryCodes = detail.message;
    if (detail.path.startsWith('requested_handles')) {
      const item = draft.handles[detailIndex(detail.path)] ?? draft.handles[0];
      if (item) errors.handles[item.id] = detail.message;
    }
    if (detail.path.startsWith('public_sources')) {
      const item = draft.sources[detailIndex(detail.path)] ?? draft.sources[0];
      if (item) errors.sources[item.id] = detail.message;
    }
  });
  return errors;
}

function requestErrorContent(error: PublicApiError) {
  if (error.status === 409) {
    return {
      heading: 'This proposal is already pending',
      message:
        'A matching proposal is already waiting for review. Your form has been preserved so you can check the details.',
    };
  }
  if (error.status === 429) {
    return {
      heading: 'Too many submission attempts',
      message: 'Please wait before trying again. Your form has been preserved.',
    };
  }
  if (error.status === 0 || error.code === 'network_error') {
    return {
      heading: 'The Registry could not be reached',
      message: 'Check your connection and try again. Your form has been preserved.',
    };
  }
  return {
    heading: 'The submission could not be sent',
    message: error.message,
  };
}

function IndividualSubmissionForm() {
  const [draft, setDraft] = useState<SubmissionDraft>(createEmptyDraft);
  const [errors, setErrors] = useState<SubmissionErrors>(createEmptySubmissionErrors);
  const [requestError, setRequestError] = useState<PublicApiError | null>(null);
  const [showValidationSummary, setShowValidationSummary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState<SubmissionAcknowledgement | null>(null);
  const nextHandleId = useRef(2);
  const nextSourceId = useRef(2);
  const submissionPending = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const summaryItems = useMemo(() => validationSummaryItems(errors, draft), [draft, errors]);

  function focusValidationSummary() {
    window.requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function updateList(field: 'handles' | 'sources', id: string, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].map((item) => (item.id === id ? { ...item, value } : item)),
    }));
    setErrors((current) => {
      const nextRows = { ...current[field] };
      delete nextRows[id];
      return { ...current, [field]: nextRows };
    });
  }

  function addListItem(field: 'handles' | 'sources'): string | null {
    const currentItems = draft[field];
    if (currentItems.length >= 10) return null;
    const id = String(field === 'handles' ? nextHandleId.current++ : nextSourceId.current++);
    setDraft((current) => ({
      ...current,
      [field]: [...current[field], { id, value: '' }],
    }));
    return id;
  }

  function removeListItem(field: 'handles' | 'sources', id: string) {
    setDraft((current) => {
      if (current[field].length === 1) return current;
      return { ...current, [field]: current[field].filter((item) => item.id !== id) };
    });
    setErrors((current) => {
      const nextRows = { ...current[field] };
      delete nextRows[id];
      return { ...current, [field]: nextRows };
    });
  }

  function setCreatorName(value: string) {
    setDraft((current) => ({ ...current, creatorName: value }));
    if (errors.creatorName) {
      setErrors((current) => ({ ...current, creatorName: undefined }));
    }
  }

  function setCategory(value: SubmissionCategory | '') {
    setDraft((current) => ({ ...current, category: value }));
    if (errors.category) {
      setErrors((current) => ({ ...current, category: undefined }));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionPending.current) return;

    const validation = validateSubmissionDraft(draft);
    if (!validation.validated) {
      setErrors(validation.errors);
      setRequestError(null);
      setShowValidationSummary(true);
      focusValidationSummary();
      return;
    }

    submissionPending.current = true;
    setErrors(createEmptySubmissionErrors());
    setRequestError(null);
    setShowValidationSummary(false);
    setSubmitting(true);
    try {
      const response = await publicApi.submitCreator({
        category: validation.validated.category,
        country_codes: validation.validated.countryCodes.length
          ? validation.validated.countryCodes
          : null,
        creator_name: validation.validated.creatorName,
        public_sources: validation.validated.sources,
        requested_handles: validation.validated.handles,
      });
      setAcknowledgement(response.data);
      window.scrollTo({ top: 0 });
    } catch (error) {
      const apiError =
        error instanceof PublicApiError
          ? error
          : new PublicApiError({
              code: 'unexpected_error',
              message: 'The submission could not be sent.',
              status: 0,
            });
      setErrors(mapServerErrors(apiError, draft));
      setRequestError(apiError);
      setShowValidationSummary(true);
      focusValidationSummary();
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  }

  function submitAnother() {
    nextHandleId.current = 2;
    nextSourceId.current = 2;
    setDraft(createEmptyDraft());
    setErrors(createEmptySubmissionErrors());
    setRequestError(null);
    setShowValidationSummary(false);
    setAcknowledgement(null);
    window.requestAnimationFrame(() => document.getElementById('submission-creator-name')?.focus());
  }

  if (acknowledgement) {
    return (
      <div className="submission-success" aria-live="polite">
        <p className="record-type">Creator suggestion</p>
        <h1>Submission received</h1>
        <p>
          Your suggestion is pending human review. It has not approved a creator or reserved any
          username.
        </p>
        <dl>
          <div>
            <dt>Submission ID</dt>
            <dd>{acknowledgement.id}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Pending review</dd>
          </div>
        </dl>
        <p>
          Reviewers may inspect the public sources. Approval is not guaranteed, and no review time
          is promised. Merchrix creator claims remain a separate process.
        </p>
        <div className="form-actions">
          <button className="primary-button" type="button" onClick={submitAnother}>
            Submit another creator
          </button>
          <Link className="secondary-button" to="/creators">
            Explore the Registry
          </Link>
        </div>
      </div>
    );
  }

  const requestErrorCopy = requestError ? requestErrorContent(requestError) : null;

  return (
    <div className="submission-mode-content">
      {(showValidationSummary && summaryItems.length) || requestError ? (
        <div
          className="validation-summary"
          id="submission-errors"
          role="alert"
          tabIndex={-1}
          ref={summaryRef}
        >
          <h2>{requestErrorCopy?.heading ?? 'Review the submission'}</h2>
          {requestErrorCopy ? <p>{requestErrorCopy.message}</p> : null}
          {summaryItems.length ? (
            <ul>
              {summaryItems.map(({ message, targetId }) => (
                <li key={`${targetId}:${message}`}>
                  <a
                    href={`#${targetId}`}
                    onClick={(event) => {
                      event.preventDefault();
                      document.getElementById(targetId)?.focus();
                    }}
                  >
                    {message}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {requestError?.requestId ? (
            <p className="request-id">Request ID: {requestError.requestId}</p>
          ) : null}
        </div>
      ) : null}

      <form className="submission-form" onSubmit={(event) => void submit(event)} noValidate>
        <section aria-labelledby="creator-information-title">
          <div className="form-section-heading">
            <span aria-hidden="true">1</span>
            <div>
              <h2 id="creator-information-title">Creator information</h2>
              <p>Use the creator’s best-known public details. Required fields are marked with *.</p>
            </div>
          </div>
          <div className="form-grid">
            <FormField
              id="submission-creator-name"
              label="Creator public name"
              required
              error={errors.creatorName}
              help="Use the name the creator is best known by publicly. Do not enter a legal name unless it is also their public name."
            >
              <input
                id="submission-creator-name"
                name="creator_name"
                value={draft.creatorName}
                onBlur={() =>
                  setErrors((current) => ({
                    ...current,
                    creatorName: validateCreatorName(draft.creatorName),
                  }))
                }
                onChange={(event) => setCreatorName(event.currentTarget.value)}
                aria-invalid={Boolean(errors.creatorName)}
                aria-describedby={fieldDescriptionIds(
                  'submission-creator-name',
                  true,
                  Boolean(errors.creatorName),
                )}
                maxLength={120}
                placeholder="e.g. Wizkid"
                required
              />
            </FormField>
            <CategorySelect
              value={draft.category}
              error={errors.category}
              onBlur={() =>
                setErrors((current) => ({
                  ...current,
                  category: validateCategory(draft.category),
                }))
              }
              onChange={setCategory}
            />
            <CountryMultiSelect
              selected={draft.countryCodes}
              error={errors.countryCodes}
              onChange={(countryCodes) => {
                setDraft((current) => ({ ...current, countryCodes }));
                setErrors((current) => ({ ...current, countryCodes: undefined }));
              }}
            />
          </div>
        </section>

        <section aria-labelledby="requested-usernames-title">
          <div className="form-section-heading">
            <span aria-hidden="true">2</span>
            <div>
              <h2 id="requested-usernames-title">Requested usernames</h2>
              <p>Add 1–10 usernames for reviewers to consider.</p>
            </div>
          </div>
          <RequestedUsernames
            items={draft.handles}
            errors={errors.handles}
            onAdd={() => addListItem('handles')}
            onBlur={() =>
              setErrors((current) => ({
                ...current,
                handles: validateHandleRows(draft.handles),
              }))
            }
            onChange={(id, value) => updateList('handles', id, value)}
            onRemove={(id) => removeListItem('handles', id)}
          />
        </section>

        <section aria-labelledby="public-sources-title">
          <div className="form-section-heading">
            <span aria-hidden="true">3</span>
            <div>
              <h2 id="public-sources-title">Public supporting sources</h2>
              <p>Add 1–10 complete public links that help reviewers identify the creator.</p>
            </div>
          </div>
          <SupportingSources
            items={draft.sources}
            errors={errors.sources}
            onAdd={() => addListItem('sources')}
            onBlur={() =>
              setErrors((current) => ({
                ...current,
                sources: validateSourceRows(draft.sources),
              }))
            }
            onChange={(id, value) => updateList('sources', id, value)}
            onRemove={(id) => removeListItem('sources', id)}
          />
        </section>

        <section className="submission-confirmation" aria-labelledby="confirmation-title">
          <div className="form-section-heading">
            <span aria-hidden="true">4</span>
            <div>
              <h2 id="confirmation-title">Review and submit</h2>
              <p>Check the summary and confirm that this form contains public information only.</p>
            </div>
          </div>
          <SubmissionReviewSummary draft={draft} />
          <div className="privacy-notice">
            <h3>Keep private and sensitive information out of this form</h3>
            <p>Do not submit:</p>
            <ul>
              <li>government identity documents;</li>
              <li>private phone numbers or addresses;</li>
              <li>passwords or private creator-claim evidence;</li>
              <li>confidential contracts or private notes.</li>
            </ul>
            <p>
              This form suggests a creator for Registry review. It is not the Merchrix creator-claim
              form. A submission does not approve a creator, reserve a username, or establish legal
              ownership.
            </p>
          </div>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for review'}
          </button>
          <p className="sr-only" role="status" aria-live="polite">
            {submitting ? 'Submitting your creator suggestion.' : ''}
          </p>
        </section>
      </form>
    </div>
  );
}

export default function SubmissionPage() {
  useDocumentTitle('Submit a creator');
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = searchParams.get('mode') === 'bulk' ? 'bulk' : 'individual';
  const [bulkLoaded, setBulkLoaded] = useState(mode === 'bulk');

  function selectMode(nextMode: 'individual' | 'bulk') {
    const next = new URLSearchParams(searchParams);
    if (nextMode === 'bulk') {
      next.set('mode', 'bulk');
      setBulkLoaded(true);
    } else {
      next.delete('mode');
    }
    setSearchParams(next);
  }

  function handleModeKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentMode: 'individual' | 'bulk',
  ) {
    let nextMode: 'individual' | 'bulk' | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      nextMode = currentMode === 'individual' ? 'bulk' : 'individual';
    } else if (event.key === 'Home') {
      nextMode = 'individual';
    } else if (event.key === 'End') {
      nextMode = 'bulk';
    }
    if (!nextMode) return;
    event.preventDefault();
    selectMode(nextMode);
    window.requestAnimationFrame(() =>
      document.getElementById(`submission-mode-${nextMode}-tab`)?.focus(),
    );
  }

  return (
    <div className="page-container submission-page">
      <PageIntro
        title="Suggest creators for Registry review."
        description={
          <p>
            Submit one creator manually or upload a spreadsheet. Every accepted suggestion remains
            pending human review; it does not approve a creator or reserve a username.
          </p>
        }
      />
      <div className="submission-mode-tabs" role="tablist" aria-label="Submission method">
        <button
          id="submission-mode-individual-tab"
          type="button"
          role="tab"
          aria-controls="submission-mode-individual-panel"
          aria-selected={mode === 'individual'}
          tabIndex={mode === 'individual' ? 0 : -1}
          onClick={() => selectMode('individual')}
          onKeyDown={(event) => handleModeKeyDown(event, 'individual')}
        >
          Submit one creator
        </button>
        <button
          id="submission-mode-bulk-tab"
          type="button"
          role="tab"
          aria-controls="submission-mode-bulk-panel"
          aria-selected={mode === 'bulk'}
          tabIndex={mode === 'bulk' ? 0 : -1}
          onClick={() => selectMode('bulk')}
          onKeyDown={(event) => handleModeKeyDown(event, 'bulk')}
        >
          Upload spreadsheet
        </button>
      </div>
      <div
        id="submission-mode-individual-panel"
        role="tabpanel"
        aria-labelledby="submission-mode-individual-tab"
        hidden={mode !== 'individual'}
      >
        <IndividualSubmissionForm />
      </div>
      {bulkLoaded ? (
        <div
          id="submission-mode-bulk-panel"
          role="tabpanel"
          aria-labelledby="submission-mode-bulk-tab"
          hidden={mode !== 'bulk'}
        >
          <Suspense
            fallback={
              <div className="bulk-progress" role="status">
                Loading spreadsheet tools…
              </div>
            }
          >
            <BulkSubmissionPanel onSubmitOne={() => selectMode('individual')} />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
