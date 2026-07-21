import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';

export function renderWithRouter(element: ReactElement, route = '/') {
  return render(<MemoryRouter initialEntries={[route]}>{element}</MemoryRouter>);
}
