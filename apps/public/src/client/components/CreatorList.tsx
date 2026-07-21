import { Link } from 'react-router';

import type { PublicCreator } from '../api/schemas';
import { formatCountry, formatLabel } from '../utils/format';

export function CreatorList({ creators }: { creators: PublicCreator[] }) {
  return (
    <div className="creator-list">
      {creators.map((creator) => (
        <article className="creator-list-item" key={creator.id}>
          <div className="creator-list-item__identity">
            <h2>
              <Link to={`/creators/${creator.id}`}>{creator.canonical_name}</Link>
            </h2>
            <p>
              {creator.biography_summary ?? 'No public biography summary is currently recorded.'}
            </p>
          </div>
          <dl className="creator-list-item__facts">
            <div>
              <dt>Category</dt>
              <dd>
                {creator.primary_category ? formatLabel(creator.primary_category) : 'Not recorded'}
              </dd>
            </div>
            <div>
              <dt>Country</dt>
              <dd>
                {creator.country_codes?.length
                  ? creator.country_codes.map(formatCountry).join(', ')
                  : 'Not recorded'}
              </dd>
            </div>
            <div>
              <dt>Protection tier</dt>
              <dd>{formatLabel(creator.protection_tier)}</dd>
            </div>
            <div>
              <dt>Entity</dt>
              <dd>{formatLabel(creator.entity_type)}</dd>
            </div>
          </dl>
          <Link className="creator-list-item__link" to={`/creators/${creator.id}`}>
            Open public record
            <span aria-hidden="true">→</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
