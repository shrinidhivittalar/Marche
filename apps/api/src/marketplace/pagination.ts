// module3.md specifies a fuller pagination envelope than the Profiles
// module's { items, total, page, limit } — it adds totalPages, hasNext and
// hasPrevious so a client can render paging controls without recomputing
// them. Implemented as specced; the two shapes differing across modules is
// noted as an inconsistency to reconcile, not something to paper over here.
export interface Paginated<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export function paginate<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  // Math.ceil(0 / limit) is 0, so an empty result set reports 0 pages
  // rather than 1 — and a page past the end returns empty data with
  // correct metadata rather than a 404.
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}
