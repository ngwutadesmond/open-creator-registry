import type { CountryCode, SubmissionCategory } from '@open-creator-registry/contracts/submissions';
import {
  isSubmissionCategory,
  normalizePublicSourceUrl,
} from '@open-creator-registry/contracts/submissions';
import { validateHandle } from '@open-creator-registry/normalization';

export type RepeatableDraftItem = {
  id: string;
  value: string;
};

export type SubmissionDraft = {
  category: SubmissionCategory | '';
  countryCodes: CountryCode[];
  creatorName: string;
  handles: RepeatableDraftItem[];
  sources: RepeatableDraftItem[];
};

export type SubmissionErrors = {
  category?: string;
  countryCodes?: string;
  creatorName?: string;
  handles: Record<string, string>;
  sources: Record<string, string>;
};

export type ValidatedSubmission = {
  category: SubmissionCategory;
  countryCodes: CountryCode[];
  creatorName: string;
  handles: string[];
  sources: string[];
};

export function createEmptySubmissionErrors(): SubmissionErrors {
  return { handles: {}, sources: {} };
}

export function fieldDescriptionIds(id: string, help: boolean, error: boolean) {
  return (
    [help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') ||
    undefined
  );
}

export function validateCreatorName(value: string): string | undefined {
  const length = value.trim().length;
  if (length < 2) return 'Enter the creator’s public name.';
  if (length > 120) return 'Creator public name must be 120 characters or fewer.';
  return undefined;
}

export function validateCategory(value: string): string | undefined {
  return isSubmissionCategory(value) ? undefined : 'Select a category.';
}

export function validateHandleRows(items: readonly RepeatableDraftItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const firstNormalizedIndex = new Map<string, number>();

  items.forEach((item, index) => {
    const value = item.value.trim();
    if (!value) {
      errors[item.id] =
        index === 0
          ? 'Enter at least one requested username.'
          : 'Enter a username or remove this row.';
      return;
    }

    const result = validateHandle(value);
    if (!result.valid) {
      errors[item.id] = result.issues[0]?.message ?? 'Enter a supported username.';
      return;
    }

    const previousIndex = firstNormalizedIndex.get(result.normalized);
    if (previousIndex !== undefined) {
      errors[item.id] = `This duplicates username ${previousIndex + 1} after normalization.`;
      return;
    }
    firstNormalizedIndex.set(result.normalized, index);
  });

  return errors;
}

export function validateSourceRows(items: readonly RepeatableDraftItem[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const firstNormalizedIndex = new Map<string, number>();

  items.forEach((item, index) => {
    const value = item.value.trim();
    if (!value) {
      errors[item.id] =
        index === 0
          ? 'Enter at least one public supporting source.'
          : 'Enter a source URL or remove this row.';
      return;
    }

    const normalized = normalizePublicSourceUrl(value);
    if (!normalized) {
      errors[item.id] = 'Use a complete public URL beginning with http:// or https://.';
      return;
    }

    const previousIndex = firstNormalizedIndex.get(normalized);
    if (previousIndex !== undefined) {
      errors[item.id] = `This duplicates source ${previousIndex + 1}.`;
      return;
    }
    firstNormalizedIndex.set(normalized, index);
  });

  return errors;
}

export function validateSubmissionDraft(draft: SubmissionDraft): {
  errors: SubmissionErrors;
  validated: ValidatedSubmission | null;
} {
  const errors: SubmissionErrors = {
    category: validateCategory(draft.category),
    countryCodes: draft.countryCodes.length > 10 ? 'Select no more than 10 countries.' : undefined,
    creatorName: validateCreatorName(draft.creatorName),
    handles: validateHandleRows(draft.handles),
    sources: validateSourceRows(draft.sources),
  };

  if (hasSubmissionErrors(errors) || !isSubmissionCategory(draft.category)) {
    return { errors, validated: null };
  }

  return {
    errors,
    validated: {
      category: draft.category,
      countryCodes: draft.countryCodes,
      creatorName: draft.creatorName.trim(),
      handles: draft.handles.map(({ value }) => value.trim()),
      sources: draft.sources.map(({ value }) => normalizePublicSourceUrl(value) ?? value.trim()),
    },
  };
}

export function hasSubmissionErrors(errors: SubmissionErrors): boolean {
  return Boolean(
    errors.category ||
    errors.countryCodes ||
    errors.creatorName ||
    Object.keys(errors.handles).length ||
    Object.keys(errors.sources).length,
  );
}
