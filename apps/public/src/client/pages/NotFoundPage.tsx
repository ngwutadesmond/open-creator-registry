import { Link } from 'react-router';

import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="page-container not-found-page">
      <p className="record-type">404</p>
      <h1>This public Registry page does not exist.</h1>
      <p>Check the address or return to a supported public search experience.</p>
      <div className="form-actions">
        <Link className="primary-button" to="/creators">
          Explore creators
        </Link>
        <Link className="secondary-button" to="/check">
          Check a handle
        </Link>
      </div>
    </div>
  );
}
