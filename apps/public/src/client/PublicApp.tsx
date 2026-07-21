import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';

import { AppShell } from './app/AppShell';
import { RouteErrorBoundary } from './app/RouteErrorBoundary';
import { LoadingState } from './components/AsyncStates';
import HomePage from './pages/HomePage';

const AboutPage = lazy(() => import('./pages/AboutPage'));
const ApiTesterPage = lazy(() => import('./pages/ApiTesterPage'));
const CreatorDetailPage = lazy(() => import('./pages/CreatorDetailPage'));
const CreatorsPage = lazy(() => import('./pages/CreatorsPage'));
const HandleCheckPage = lazy(() => import('./pages/HandleCheckPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ReleasesPage = lazy(() => import('./pages/ReleasesPage'));
const SubmissionPage = lazy(() => import('./pages/SubmissionPage'));

function RouteLoadingState() {
  return (
    <div className="page-container route-loading">
      <LoadingState label="Loading page" />
    </div>
  );
}

export function PublicApp() {
  return (
    <RouteErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<RouteLoadingState />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="check" element={<HandleCheckPage />} />
              <Route path="creators" element={<CreatorsPage />} />
              <Route path="creators/:creatorId" element={<CreatorDetailPage />} />
              <Route path="releases" element={<ReleasesPage />} />
              <Route path="submit" element={<SubmissionPage />} />
              <Route path="api-tester" element={<ApiTesterPage />} />
              <Route path="about" element={<AboutPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </RouteErrorBoundary>
  );
}
