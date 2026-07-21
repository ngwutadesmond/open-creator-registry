import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | Open Creator Registry`;
    return () => {
      document.title = 'Open Creator Registry';
    };
  }, [title]);
}
