import { ProgressSchema, ReviewQueueSchema, SERVICES, USER_ID_HEADER, type Progress, type SkillScore } from '@music/contracts';

/** What the practice service needs from the progress service to build a review. */
export interface ProgressClient {
  getProgress(userId: string): Promise<Progress>;
  /** Skills due for review now. */
  getReviewQueue(userId: string): Promise<SkillScore[]>;
}

/**
 * Calls the progress service directly (service to service, not through the
 * gateway), passing the learner on as x-user-id: GET / and GET /review-queue.
 */
export class HttpProgressClient implements ProgressClient {
  constructor(private readonly baseUrl = process.env.PROGRESS_URL ?? `http://localhost:${SERVICES.progress.port}`) {}

  async getProgress(userId: string): Promise<Progress> {
    return ProgressSchema.parse(await this.get('/', userId));
  }

  async getReviewQueue(userId: string): Promise<SkillScore[]> {
    return ReviewQueueSchema.parse(await this.get('/review-queue', userId));
  }

  private async get(path: string, userId: string): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(new URL(path, this.baseUrl), { headers: { [USER_ID_HEADER]: userId } });
    } catch {
      throw Object.assign(new Error('progress service unreachable'), { statusCode: 503 });
    }
    if (!res.ok) throw Object.assign(new Error(`progress service answered ${res.status} for ${path}`), { statusCode: 502 });
    return res.json();
  }
}
