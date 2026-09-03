export interface Paginated<T> {
  records: T[];
  page: number;
  limit: number;
  totalRecords: number;
  totalPages: number;
}

export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit ?? 10) || 10));
  return { page, limit, offset: (page - 1) * limit };
}

export function paginate<T>(
  records: T[],
  totalRecords: number,
  page: number,
  limit: number,
): Paginated<T> {
  return {
    records,
    page,
    limit,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
  };
}
