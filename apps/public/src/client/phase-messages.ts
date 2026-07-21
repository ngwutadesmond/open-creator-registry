export const apiDocumentationPhaseMessage =
  'API documentation will be available in Phase 3, when the public API schemas are implemented.';

export function getRegistrySearchMessage(query: string): string {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return 'Enter a creator name, alias, or handle to search the registry.';
  }

  return `“${normalizedQuery}” can be searched after the public API and explorer are connected in Phases 3 and 4.`;
}
