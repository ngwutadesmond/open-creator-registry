import {
  formatCountryCode,
  formatSubmissionCategory,
} from '@open-creator-registry/contracts/submissions';

import type { SubmissionDraft } from './submission-form';

export function SubmissionReviewSummary({ draft }: { draft: SubmissionDraft }) {
  const handleCount = draft.handles.filter(({ value }) => value.trim()).length;
  const sourceCount = draft.sources.filter(({ value }) => value.trim()).length;

  return (
    <div className="submission-review-summary" aria-labelledby="submission-review-summary-title">
      <h3 id="submission-review-summary-title">Review summary</h3>
      <dl>
        <div>
          <dt>Creator name</dt>
          <dd>{draft.creatorName.trim() || 'Not entered'}</dd>
        </div>
        <div>
          <dt>Category</dt>
          <dd>{formatSubmissionCategory(draft.category) ?? 'Not selected'}</dd>
        </div>
        <div>
          <dt>Countries</dt>
          <dd>
            {draft.countryCodes.length
              ? draft.countryCodes.map(formatCountryCode).join(', ')
              : 'None selected'}
          </dd>
        </div>
        <div>
          <dt>Requested usernames</dt>
          <dd>{handleCount}</dd>
        </div>
        <div>
          <dt>Supporting sources</dt>
          <dd>{sourceCount}</dd>
        </div>
      </dl>
    </div>
  );
}
