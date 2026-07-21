import { Link } from 'react-router';

import type { HandleCheckResult } from '../api/schemas';
import { formatDateTime } from '../utils/format';
import { ClassificationBadge } from './Classification';
import { classificationContent, matchTypeContent } from './classification-content';
import { Disclaimer } from './Disclaimer';

export function ProtectionResult({ result }: { result: HandleCheckResult }) {
  const content = classificationContent[result.registry_status];
  const creator = result.ambiguous ? null : result.creator;

  return (
    <section
      className={`protection-result protection-result--${result.registry_status}`}
      aria-labelledby="protection-result-title"
      aria-live="polite"
    >
      <div className="protection-result__heading">
        <ClassificationBadge classification={result.registry_status} />
        <h2 id="protection-result-title">{content.title}</h2>
        <p>{content.description}</p>
      </div>

      {result.ambiguous ? (
        <div className="review-notice" role="note">
          <strong>Manual review required.</strong>
          <span>
            Multiple public Registry signals conflict, so this result does not attribute the handle
            to one creator.
          </span>
        </div>
      ) : null}

      <dl className="result-facts">
        <div>
          <dt>Submitted handle</dt>
          <dd>{result.input}</dd>
        </div>
        <div>
          <dt>Normalized comparison</dt>
          <dd className="handle-value">@{result.normalized_handle}</dd>
        </div>
        <div>
          <dt>Matched by</dt>
          <dd>{matchTypeContent[result.matched_by]}</dd>
        </div>
        <div>
          <dt>Confidence signal</dt>
          <dd>{result.confidence_score}%</dd>
        </div>
        <div>
          <dt>Registry version</dt>
          <dd>{result.registry_version ?? 'Unversioned development state'}</dd>
        </div>
        <div>
          <dt>Registry last updated</dt>
          <dd>{formatDateTime(result.registry_last_updated_at)}</dd>
        </div>
      </dl>

      <div className="recommended-action">
        <h3>Recommended platform action</h3>
        <p>{content.action}</p>
        {result.registration_may_continue ? (
          <p>
            Registration may continue, but that does not authorize assignment of the requested
            username. Use a unique temporary username whenever claim or review is required.
          </p>
        ) : null}
        {result.claim_allowed ? (
          <p>
            Creator claims belong to the consuming platform’s verification process; this public
            Registry does not approve claims.
          </p>
        ) : null}
      </div>

      {creator ? (
        <div className="matched-creator">
          <span>Associated public creator</span>
          <Link to={`/creators/${creator.id}`}>{creator.canonical_name}</Link>
          <p>{creator.biography_summary}</p>
        </div>
      ) : null}

      {result.matched_by === 'confusable_skeleton' ? (
        <p className="risk-note">
          Visual similarity is a risk indicator for review. It does not prove that two identities
          are the same.
        </p>
      ) : null}

      <Disclaimer compact />
    </section>
  );
}
