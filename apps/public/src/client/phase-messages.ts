export function getRegistrySearchMessage(query: string): string {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return 'Enter a creator name, alias, or handle to search the registry.';
  }

  return `“${normalizedQuery}” can be searched here when the public explorer is connected in Phase 4. The API is available now.`;
}
