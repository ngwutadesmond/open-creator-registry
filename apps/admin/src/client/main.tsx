import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@open-creator-registry/ui/styles.css';
import { AdminApp } from './AdminApp';
import './admin.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
