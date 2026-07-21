import { Link } from 'react-router';

import { PageHeader } from '../components/AdminPrimitives';

export default function NotFoundPage() {
  return (
    <>
      <PageHeader
        title="Administration page not found"
        description="This private route does not exist."
      />
      <Link className="primary-button inline-action" to="/">
        Return to dashboard
      </Link>
    </>
  );
}
