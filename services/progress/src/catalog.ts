import { SERVICES, UnitListSchema } from '@music/contracts';
import type { CatalogUnit } from './unlocks.js';

/** Where the unit and lesson order comes from. */
export interface Catalog {
  units(): Promise<CatalogUnit[]>;
}

export class StaticCatalog implements Catalog {
  constructor(private readonly list: CatalogUnit[]) {}
  async units(): Promise<CatalogUnit[]> {
    return this.list;
  }
}

/**
 * Reads GET /units from the curriculum service (CURRICULUM_URL, default the
 * local port) and caches it, since content only changes on deploy.
 */
export class CurriculumCatalog implements Catalog {
  private cached: { at: number; units: CatalogUnit[] } | null = null;

  constructor(
    private readonly baseUrl = process.env.CURRICULUM_URL ?? `http://localhost:${SERVICES.curriculum.port}`,
    private readonly ttlMs = 5 * 60_000,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async units(): Promise<CatalogUnit[]> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) return this.cached.units;
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/units`);
    } catch {
      return this.stale('curriculum service unreachable');
    }
    if (!res.ok) return this.stale(`curriculum service answered ${res.status}`);
    const units = UnitListSchema.parse(await res.json()).map(({ id, instrument, order, lessonIds }) => ({ id, instrument, order, lessonIds }));
    this.cached = { at: Date.now(), units };
    return units;
  }

  /** Serve the last good copy rather than failing, or a 503 if there is none. */
  private stale(reason: string): CatalogUnit[] {
    if (this.cached) return this.cached.units;
    throw Object.assign(new Error(reason), { statusCode: 503 });
  }
}
