import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@open-creator-registry/ui/styles.css';
import './public.css';
import { PublicApp } from './PublicApp';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Application root element was not found.');
}

createRoot(rootElement).render(
  <StrictMode>
    <PublicApp />
  </StrictMode>,
);
