function snakeCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `_${character.toLowerCase()}`);
}

export function toAdminApiValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toAdminApiValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [snakeCase(key), toAdminApiValue(entry)]),
  );
}
