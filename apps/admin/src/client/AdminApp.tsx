import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';

import { AdminIdentityProvider } from './app/AdminIdentityContext';
import { AdminShell } from './app/AdminShell';
import { LoadingState } from './components/AsyncStates';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const CreatorsPages = lazy(() => import('./pages/CreatorsPages'));
const HandlesPages = lazy(() => import('./pages/HandlesPages'));
const ReviewPages = lazy(() => import('./pages/ReviewPages'));
const OperationsPages = lazy(() => import('./pages/OperationsPages'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageSuspense() {
  return (
    <Suspense fallback={<LoadingState label="Loading administration view…" />}>
      <AdminShell />
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    element: (
      <AdminIdentityProvider>
        <PageSuspense />
      </AdminIdentityProvider>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'creators', element: <CreatorsPages mode="list" /> },
      { path: 'creators/new', element: <CreatorsPages mode="new" /> },
      { path: 'creators/:creatorId', element: <CreatorsPages mode="detail" /> },
      { path: 'handles', element: <HandlesPages mode="list" /> },
      { path: 'handles/new', element: <HandlesPages mode="new" /> },
      { path: 'handles/:handleId', element: <HandlesPages mode="detail" /> },
      { path: 'candidates', element: <ReviewPages type="candidates" mode="list" /> },
      { path: 'candidates/:recordId', element: <ReviewPages type="candidates" mode="detail" /> },
      { path: 'submissions', element: <ReviewPages type="submissions" mode="list" /> },
      { path: 'submissions/:recordId', element: <ReviewPages type="submissions" mode="detail" /> },
      { path: 'imports', element: <OperationsPages type="imports" mode="list" /> },
      { path: 'imports/:recordId', element: <OperationsPages type="imports" mode="detail" /> },
      { path: 'ingestion-runs', element: <OperationsPages type="ingestion" mode="list" /> },
      {
        path: 'ingestion-runs/:recordId',
        element: <OperationsPages type="ingestion" mode="detail" />,
      },
      { path: 'releases', element: <OperationsPages type="releases" mode="list" /> },
      { path: 'releases/:recordId', element: <OperationsPages type="releases" mode="detail" /> },
      { path: 'approvals', element: <OperationsPages type="approvals" mode="list" /> },
      { path: 'approvals/:recordId', element: <OperationsPages type="approvals" mode="detail" /> },
      { path: 'audit-logs', element: <OperationsPages type="audits" mode="list" /> },
      { path: 'audit-logs/:recordId', element: <OperationsPages type="audits" mode="detail" /> },
      { path: 'settings', element: <OperationsPages type="settings" mode="detail" /> },
      { path: 'me', element: <Navigate to="/settings" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function AdminApp() {
  return <RouterProvider router={router} />;
}
