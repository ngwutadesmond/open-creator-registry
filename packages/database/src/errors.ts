export type DatabaseErrorCode =
  'not_found' | 'unique_constraint' | 'constraint_violation' | 'invalid_input' | 'database_failure';

export class RegistryDatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RegistryDatabaseError';
    this.code = code;
  }
}

export function createNotFoundError(entity: string, id: string): RegistryDatabaseError {
  return new RegistryDatabaseError('not_found', `${entity} record was not found: ${id}`);
}

export function createInvalidInputError(message: string): RegistryDatabaseError {
  return new RegistryDatabaseError('invalid_input', message);
}

export function mapDatabaseError(error: unknown, operation: string): RegistryDatabaseError {
  if (error instanceof RegistryDatabaseError) {
    return error;
  }

  const sourceMessage = error instanceof Error ? error.message : String(error);
  if (/UNIQUE constraint failed|unique constraint/iu.test(sourceMessage)) {
    return new RegistryDatabaseError(
      'unique_constraint',
      `A record with the same unique registry value already exists (${operation}).`,
      { cause: error },
    );
  }
  if (
    /CHECK constraint failed|FOREIGN KEY constraint failed|constraint failed/iu.test(sourceMessage)
  ) {
    return new RegistryDatabaseError(
      'constraint_violation',
      `The database rejected an invalid registry value (${operation}).`,
      { cause: error },
    );
  }

  return new RegistryDatabaseError(
    'database_failure',
    `The registry database operation failed (${operation}).`,
    { cause: error },
  );
}

export async function withDatabaseErrorMapping<T>(
  operation: string,
  callback: () => Promise<T>,
): Promise<T> {
  try {
    return await callback();
  } catch (error) {
    throw mapDatabaseError(error, operation);
  }
}
