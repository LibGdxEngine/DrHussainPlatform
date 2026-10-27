/** The envelope every list endpoint returns (DRF page-number pagination). */
export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** The largest page the API allows; for short, bounded lists the screens show whole. */
export const MAX_PAGE_SIZE = 200;
