export interface PageResponse<T, M = undefined> {
  data: T[];
  nextCursor: string | null;
  total?: number;
  meta?: M;
}

/** Fetches every page for list endpoints that use cursor pagination. */
export async function fetchAllPages<T, M = undefined>(
  fetchPage: (cursor?: string) => Promise<PageResponse<T, M>>,
  maxPages = 50,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const res = await fetchPage(cursor);
    items.push(...res.data);
    if (!res.nextCursor) break;
    cursor = res.nextCursor;
  }
  return items;
}
