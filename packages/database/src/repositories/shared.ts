import { createInvalidInputError, withDatabaseErrorMapping } from '../errors';
import type { Pagination } from '../models';

export function resolvePagination(pagination: Pagination = {}): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = pagination.page ?? 1;
  const limit = pagination.limit ?? 25;
  if (!Number.isInteger(page) || page < 1) {
    throw createInvalidInputError('Pagination page must be a positive integer.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createInvalidInputError('Pagination limit must be an integer between 1 and 100.');
  }
  return { page, limit, offset: (page - 1) * limit };
}

export async function runStatement(
  statement: D1PreparedStatement,
  operation: string,
): Promise<D1Result<unknown>> {
  return withDatabaseErrorMapping(operation, () => statement.run());
}

export async function allRows<T>(statement: D1PreparedStatement, operation: string): Promise<T[]> {
  const result = await withDatabaseErrorMapping(operation, () => statement.all<T>());
  return result.results;
}

export async function firstRow<T>(
  statement: D1PreparedStatement,
  operation: string,
): Promise<T | null> {
  return withDatabaseErrorMapping(operation, () => statement.first<T>());
}
