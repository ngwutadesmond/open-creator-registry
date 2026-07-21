import { Link } from 'react-router';

import { registryClassifications } from '@open-creator-registry/contracts/classifications';

import { classificationContent } from '../components/classification-content';
import { Disclaimer } from '../components/Disclaimer';
import { PageIntro } from '../components/PageIntro';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function AboutPage() {
  useDocumentTitle('About the Registry');
  return (
    <div className="page-container about-page">
      <PageIntro
        title="Public infrastructure for creator-handle protection."
        description={
          <p>
            Open Creator Registry helps platforms identify usernames that warrant reservation, claim
            verification, review, or monitoring. It does not decide whether a username is available.
          </p>
        }
      />

      <section className="about-section" aria-labelledby="platform-flow-title">
        <h2 id="platform-flow-title">How a platform should use the Registry</h2>
        <ol className="process-list">
          <li>
            <span>1</span>
            <p>Check the platform’s own users database for an existing username.</p>
          </li>
          <li>
            <span>2</span>
            <p>Call the Registry API and retain its version and timestamp.</p>
          </li>
          <li>
            <span>3</span>
            <p>Apply the returned claim, review, monitoring, or separate availability policy.</p>
          </li>
          <li>
            <span>4</span>
            <p>Use a conservative fallback when the Registry is unavailable.</p>
          </li>
        </ol>
      </section>

      <section className="about-section" aria-labelledby="classification-policy-title">
        <h2 id="classification-policy-title">Classification meanings</h2>
        <div className="definition-list">
          {registryClassifications.map((classification) => (
            <article key={classification}>
              <div>
                <span className={`classification-dot ${classification}`} aria-hidden="true" />
                <h3>{classificationContent[classification].title}</h3>
              </div>
              <p>{classificationContent[classification].description}</p>
              <p>
                <strong>Platform action:</strong> {classificationContent[classification].action}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="about-section"
        id="data-source-policy"
        aria-labelledby="source-policy-title"
      >
        <h2 id="source-policy-title">Public data-source principles</h2>
        <div className="policy-columns">
          <div>
            <h3>Public and reviewable</h3>
            <p>
              Creator records should be supported by public, attributable sources whose provenance
              and licence can be reviewed.
            </p>
          </div>
          <div>
            <h3>Conservative matching</h3>
            <p>
              Aliases, similarity, and Unicode confusables are risk signals. They do not establish
              that two people or identities are the same.
            </p>
          </div>
          <div>
            <h3>Versioned decisions</h3>
            <p>
              Published releases identify a Registry decision point so consuming platforms can cache
              and audit how a result was used.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section about-section--action" aria-labelledby="participate-title">
        <div>
          <h2 id="participate-title">Participate through public evidence.</h2>
          <p>Suggestions enter review and never create an automatic protection decision.</p>
        </div>
        <Link className="primary-button" to="/submit">
          Suggest a creator
        </Link>
      </section>
      <Disclaimer />
    </div>
  );
}
