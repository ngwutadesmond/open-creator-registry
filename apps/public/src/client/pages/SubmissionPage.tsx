import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router';

import { validateHandle } from '@open-creator-registry/normalization';

import { PublicApiError, publicApi } from '../api/public-api-client';
import type { SubmissionAcknowledgement } from '../api/schemas';
import { PageIntro } from '../components/PageIntro';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type SubmissionDraft = {
  category: string;
  countryCodes: string;
  creatorName: string;
  handles: string[];
  sources: string[];
};

type SubmissionErrors = Partial<
  Record<'creatorName' | 'countryCodes' | 'handles' | 'sources', string>
>;

const emptyDraft: SubmissionDraft = {
  category: '',
  countryCodes: '',
  creatorName: '',
  handles: [''],
  sources: [''],
};

function validateSubmission(draft: SubmissionDraft) {
  const errors: SubmissionErrors = {};
  if (draft.creatorName.trim().length < 2) errors.creatorName = 'Enter a public creator name.';
  const countries = draft.countryCodes
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  if (countries.some((value) => !/^[A-Z]{2}$/u.test(value))) {
    errors.countryCodes = 'Use two-letter country codes separated by commas, such as NG, GH.';
  }
  if (countries.length > 10) errors.countryCodes = 'A submission can include at most 10 countries.';
  const handles = draft.handles.map((value) => value.trim()).filter(Boolean);
  if (handles.length === 0) errors.handles = 'Add at least one requested handle.';
  if (handles.length > 10) errors.handles = 'A submission can include at most 10 handles.';
  const invalidHandle = handles.find((value) => !validateHandle(value).valid);
  if (invalidHandle) errors.handles = `“${invalidHandle}” is not a supported handle.`;
  const sources = draft.sources.map((value) => value.trim()).filter(Boolean);
  if (sources.length === 0) errors.sources = 'Add at least one public supporting source.';
  if (sources.length > 10) errors.sources = 'A submission can include at most 10 public sources.';
  if (
    sources.some((value) => {
      try {
        const url = new URL(value);
        return url.protocol !== 'https:' && url.protocol !== 'http:';
      } catch {
        return true;
      }
    })
  ) {
    errors.sources = 'Every source must be a complete public http or https URL.';
  }
  return { countries, errors, handles, sources };
}

function mapServerErrors(error: PublicApiError): SubmissionErrors {
  const errors: SubmissionErrors = {};
  error.details.forEach((detail) => {
    if (detail.path.startsWith('creator_name')) errors.creatorName = detail.message;
    if (detail.path.startsWith('country_codes')) errors.countryCodes = detail.message;
    if (detail.path.startsWith('requested_handles')) errors.handles = detail.message;
    if (detail.path.startsWith('public_sources')) errors.sources = detail.message;
  });
  return errors;
}

export default function SubmissionPage() {
  useDocumentTitle('Submit a creator');
  const [draft, setDraft] = useState<SubmissionDraft>(emptyDraft);
  const [errors, setErrors] = useState<SubmissionErrors>({});
  const [requestError, setRequestError] = useState<PublicApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState<SubmissionAcknowledgement | null>(null);
  const validationSummary = useMemo(() => Object.values(errors).filter(Boolean), [errors]);

  function updateList(field: 'handles' | 'sources', index: number, value: string) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  }

  function addListItem(field: 'handles' | 'sources') {
    setDraft((current) =>
      current[field].length >= 10 ? current : { ...current, [field]: [...current[field], ''] },
    );
  }

  function removeListItem(field: 'handles' | 'sources', index: number) {
    setDraft((current) => ({
      ...current,
      [field]: current[field].filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validation = validateSubmission(draft);
    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors);
      setRequestError(null);
      document.getElementById('submission-errors')?.focus();
      return;
    }
    setErrors({});
    setRequestError(null);
    setSubmitting(true);
    try {
      const response = await publicApi.submitCreator({
        category: draft.category.trim() || null,
        country_codes: validation.countries.length ? validation.countries : null,
        creator_name: draft.creatorName.trim(),
        public_sources: validation.sources,
        requested_handles: validation.handles,
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
      setErrors(mapServerErrors(apiError));
      setRequestError(apiError);
      document.getElementById('submission-errors')?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  function submitAnother() {
    setDraft(emptyDraft);
    setErrors({});
    setRequestError(null);
    setAcknowledgement(null);
  }

  if (acknowledgement) {
    return (
      <div className="page-container submission-success" aria-live="polite">
        <p className="record-type">Submission received</p>
        <h1>Thank you for contributing public evidence.</h1>
        <p>
          This proposal is pending human review. It has not created an approved creator or reserved
          any username.
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
          Reviewers may inspect the public sources. Approval is not guaranteed, and Merchrix creator
          claims remain a separate platform process.
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

  return (
    <div className="page-container submission-page">
      <PageIntro
        title="Suggest a creator for Registry review."
        description={
          <p>
            Submit public creator information and supporting sources. A proposal enters review; it
            does not immediately approve a creator or reserve a username.
          </p>
        }
      />

      {validationSummary.length || requestError ? (
        <div className="validation-summary" id="submission-errors" role="alert" tabIndex={-1}>
          <h2>
            {requestError?.status === 409
              ? 'This proposal is already pending'
              : 'Review the submission'}
          </h2>
          {requestError ? <p>{requestError.message}</p> : null}
          {validationSummary.length ? (
            <ul>
              {validationSummary.map((message) => (
                <li key={message}>{message}</li>
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
            <span>1</span>
            <div>
              <h2 id="creator-information-title">Creator information</h2>
              <p>Use only information that is already public.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Creator public name <span aria-hidden="true">*</span>
              <input
                name="creator_name"
                value={draft.creatorName}
                onChange={(event) => setDraft({ ...draft, creatorName: event.target.value })}
                aria-invalid={Boolean(errors.creatorName)}
                aria-describedby={errors.creatorName ? 'creator-name-error' : undefined}
                maxLength={120}
              />
              {errors.creatorName ? (
                <span className="field-error" id="creator-name-error">
                  {errors.creatorName}
                </span>
              ) : null}
            </label>
            <label>
              Category
              <input
                name="category"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                maxLength={64}
                placeholder="music"
              />
            </label>
            <label className="form-grid__full">
              Countries
              <input
                name="country_codes"
                value={draft.countryCodes}
                onChange={(event) => setDraft({ ...draft, countryCodes: event.target.value })}
                aria-invalid={Boolean(errors.countryCodes)}
                aria-describedby={
                  errors.countryCodes ? 'country-code-help country-code-error' : 'country-code-help'
                }
                placeholder="NG, GH"
              />
              <span className="field-help" id="country-code-help">
                Optional two-letter codes separated by commas; maximum 10.
              </span>
              {errors.countryCodes ? (
                <span className="field-error" id="country-code-error">
                  {errors.countryCodes}
                </span>
              ) : null}
            </label>
          </div>
        </section>

        <section aria-labelledby="requested-handles-title">
          <div className="form-section-heading">
            <span>2</span>
            <div>
              <h2 id="requested-handles-title">Requested usernames</h2>
              <p>Add 1–10 public handles that reviewers should consider.</p>
            </div>
          </div>
          <div className="repeatable-fields">
            {draft.handles.map((handle, index) => (
              <div key={`handle-${index}`}>
                <label htmlFor={`submission-handle-${index}`}>Handle {index + 1}</label>
                <div className="repeatable-field-row">
                  <input
                    id={`submission-handle-${index}`}
                    value={handle}
                    onChange={(event) => updateList('handles', index, event.target.value)}
                    aria-invalid={Boolean(errors.handles)}
                    aria-describedby={errors.handles ? 'requested-handles-error' : undefined}
                    maxLength={128}
                  />
                  {draft.handles.length > 1 ? (
                    <button type="button" onClick={() => removeListItem('handles', index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {errors.handles ? (
              <p className="field-error" id="requested-handles-error">
                {errors.handles}
              </p>
            ) : null}
            <button
              className="text-button"
              type="button"
              onClick={() => addListItem('handles')}
              disabled={draft.handles.length >= 10}
            >
              + Add another handle
            </button>
          </div>
        </section>

        <section aria-labelledby="public-sources-title">
          <div className="form-section-heading">
            <span>3</span>
            <div>
              <h2 id="public-sources-title">Public supporting sources</h2>
              <p>Add 1–10 public http or https URLs that reviewers can inspect.</p>
            </div>
          </div>
          <div className="repeatable-fields">
            {draft.sources.map((source, index) => (
              <div key={`source-${index}`}>
                <label htmlFor={`submission-source-${index}`}>Source URL {index + 1}</label>
                <div className="repeatable-field-row">
                  <input
                    id={`submission-source-${index}`}
                    type="url"
                    value={source}
                    onChange={(event) => updateList('sources', index, event.target.value)}
                    aria-invalid={Boolean(errors.sources)}
                    aria-describedby={errors.sources ? 'public-sources-error' : undefined}
                    placeholder="https://example.com/public-profile"
                  />
                  {draft.sources.length > 1 ? (
                    <button type="button" onClick={() => removeListItem('sources', index)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
            {errors.sources ? (
              <p className="field-error" id="public-sources-error">
                {errors.sources}
              </p>
            ) : null}
            <button
              className="text-button"
              type="button"
              onClick={() => addListItem('sources')}
              disabled={draft.sources.length >= 10}
            >
              + Add another source
            </button>
          </div>
        </section>

        <section className="submission-confirmation" aria-labelledby="confirmation-title">
          <div className="form-section-heading">
            <span>4</span>
            <div>
              <h2 id="confirmation-title">Review and submit</h2>
              <p>Confirm that this form contains public evidence only.</p>
            </div>
          </div>
          <div className="privacy-notice">
            <strong>Do not submit sensitive identity documents.</strong>
            <p>
              This form does not collect submitter contact information or private notes. Public URLs
              may be checked during review. Merchrix creator claims are handled separately.
            </p>
          </div>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Submitting proposal…' : 'Submit for review'}
          </button>
        </section>
      </form>
    </div>
  );
}
