import { LessonSchema, SERVICES, UnitSchema, type Lesson, type Unit } from '@music/contracts';

/** What the practice service needs from the curriculum service. */
export interface CurriculumClient {
  /** The lesson, or null when no lesson has this id. */
  getLesson(id: string): Promise<Lesson | null>;
  /** The unit with its checkpoint, or null when no unit has this id. */
  getUnit(id: string): Promise<Unit | null>;
}

/**
 * Calls the curriculum service directly (service to service, not through the
 * gateway): GET /lessons/:id and GET /units/:id.
 */
export class HttpCurriculumClient implements CurriculumClient {
  constructor(private readonly baseUrl = process.env.CURRICULUM_URL ?? `http://localhost:${SERVICES.curriculum.port}`) {}

  async getLesson(id: string): Promise<Lesson | null> {
    const body = await this.get(`/lessons/${encodeURIComponent(id)}`);
    return body === null ? null : LessonSchema.parse(body);
  }

  async getUnit(id: string): Promise<Unit | null> {
    const body = await this.get(`/units/${encodeURIComponent(id)}`);
    return body === null ? null : UnitSchema.parse(body);
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(new URL(path, this.baseUrl));
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`curriculum service answered ${res.status} for ${path}`), { statusCode: 502 });
    return res.json();
  }
}
