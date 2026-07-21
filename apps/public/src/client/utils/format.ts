const displayNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function formatDate(value: string | null) {
  if (!value) return 'Not published';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function formatCountry(code: string) {
  return displayNames.of(code.toUpperCase()) ?? code.toUpperCase();
}

export function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/^\p{L}/u, (first) => first.toUpperCase());
}

export function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}
