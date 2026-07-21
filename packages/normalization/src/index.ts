const canonicalSeparator = '_';
const defaultMinimumLength = 2;
const defaultMaximumLength = 30;
const supportedHandlePattern = /^[\p{L}\p{N}_]+$/u;
const separatorPattern = /[\s._-]+/gu;
const combiningMarkPattern = /\p{M}+/gu;

const confusableCharacters: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '5': 's',
  '7': 't',
  а: 'a',
  в: 'b',
  е: 'e',
  і: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  ѕ: 's',
  т: 't',
  у: 'y',
  х: 'x',
  α: 'a',
  ι: 'i',
  ο: 'o',
  ρ: 'p',
  χ: 'x',
};

export type HandleValidationIssueCode =
  'not_string' | 'empty' | 'unsupported_characters' | 'too_short' | 'too_long';

export type HandleValidationIssue = {
  code: HandleValidationIssueCode;
  message: string;
};

export type HandleNormalizationOptions = {
  minimumLength?: number;
  maximumLength?: number;
};

export type ValidatedHandle = {
  valid: true;
  original: string;
  normalized: string;
};

export type InvalidHandle = {
  valid: false;
  original: unknown;
  issues: HandleValidationIssue[];
};

export type HandleValidationResult = ValidatedHandle | InvalidHandle;

export class HandleNormalizationError extends Error {
  readonly issues: HandleValidationIssue[];

  constructor(issues: HandleValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(' '));
    this.name = 'HandleNormalizationError';
    this.issues = issues;
  }
}

function normalizeSeparators(value: string): string {
  return value.replace(separatorPattern, canonicalSeparator).replace(/^_+|_+$/gu, '');
}

function prepareHandle(value: string): string {
  const trimmed = value.trim().replace(/^@+/u, '');
  const compatibilityNormalized = trimmed.normalize('NFKC').replace(/^@+/u, '');
  return normalizeSeparators(compatibilityNormalized.toLocaleLowerCase('und'));
}

function countCodePoints(value: string): number {
  return [...value].length;
}

export function validateHandle(
  input: unknown,
  options: HandleNormalizationOptions = {},
): HandleValidationResult {
  if (typeof input !== 'string') {
    return {
      valid: false,
      original: input,
      issues: [{ code: 'not_string', message: 'Handle input must be a string.' }],
    };
  }

  const minimumLength = options.minimumLength ?? defaultMinimumLength;
  const maximumLength = options.maximumLength ?? defaultMaximumLength;
  const normalized = prepareHandle(input);
  const issues: HandleValidationIssue[] = [];

  if (!normalized) {
    issues.push({ code: 'empty', message: 'Handle input must contain supported characters.' });
  } else if (!supportedHandlePattern.test(normalized)) {
    issues.push({
      code: 'unsupported_characters',
      message: 'Handles may contain Unicode letters, numbers, and canonical separators only.',
    });
  }

  const length = countCodePoints(normalized);
  if (normalized && length < minimumLength) {
    issues.push({
      code: 'too_short',
      message: `Handle must be at least ${minimumLength} characters.`,
    });
  }
  if (length > maximumLength) {
    issues.push({
      code: 'too_long',
      message: `Handle must be at most ${maximumLength} characters.`,
    });
  }

  return issues.length > 0
    ? { valid: false, original: input, issues }
    : { valid: true, original: input, normalized };
}

export function normalizeHandle(input: unknown, options: HandleNormalizationOptions = {}): string {
  const result = validateHandle(input, options);
  if (!result.valid) {
    throw new HandleNormalizationError(result.issues);
  }
  return result.normalized;
}

export function normalizeCreatorName(input: string): string {
  return input
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase('und')
    .replace(/[._-]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function createConfusableSkeleton(input: unknown): string {
  const normalized = normalizeHandle(input);
  const decomposed = normalized.normalize('NFKD').replace(combiningMarkPattern, '');

  return [...decomposed]
    .map((character) => confusableCharacters[character] ?? character)
    .join('')
    .replaceAll(canonicalSeparator, '');
}

export type HandleCandidates = {
  normalizedHandle: string;
  separatorlessHandle: string;
  confusableSkeleton: string;
};

export function createHandleCandidates(input: unknown): HandleCandidates {
  const normalizedHandle = normalizeHandle(input);
  return {
    normalizedHandle,
    separatorlessHandle: normalizedHandle.replaceAll(canonicalSeparator, ''),
    confusableSkeleton: createConfusableSkeleton(normalizedHandle),
  };
}

const protectedVariantMarkers = [
  'official',
  'real',
  'the',
  'tv',
  'hq',
  'fan',
  'fans',
  'archive',
] as const;

export function isPotentialProtectedVariant(candidate: unknown, protectedHandle: unknown): boolean {
  const candidateValues = createHandleCandidates(candidate);
  const protectedValues = createHandleCandidates(protectedHandle);

  if (candidateValues.normalizedHandle === protectedValues.normalizedHandle) {
    return false;
  }

  if (
    candidateValues.separatorlessHandle === protectedValues.separatorlessHandle ||
    candidateValues.confusableSkeleton === protectedValues.confusableSkeleton
  ) {
    return true;
  }

  return protectedVariantMarkers.some((marker) => {
    const prefix = `${marker}_${protectedValues.normalizedHandle}`;
    const suffix = `${protectedValues.normalizedHandle}_${marker}`;
    return (
      candidateValues.normalizedHandle === prefix || candidateValues.normalizedHandle === suffix
    );
  });
}
