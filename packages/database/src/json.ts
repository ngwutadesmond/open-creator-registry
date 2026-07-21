import { RegistryDatabaseError } from './errors';

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export function serializeJson(value: JsonValue): string {
  return JSON.stringify(value);
}

export function parseJson(value: string, fieldName: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch (error) {
    throw new RegistryDatabaseError(
      'database_failure',
      `The registry database contains invalid JSON in ${fieldName}.`,
      { cause: error },
    );
  }
}

export function parseStringArray(value: string | null, fieldName: string): string[] | null {
  if (value === null) {
    return null;
  }

  const parsed = parseJson(value, fieldName);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new RegistryDatabaseError(
      'database_failure',
      `The registry database contains a non-string array in ${fieldName}.`,
    );
  }
  return parsed;
}

export function parseRequiredStringArray(value: string, fieldName: string): string[] {
  return parseStringArray(value, fieldName) ?? [];
}
