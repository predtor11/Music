import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpCurriculumClient } from '../src/curriculum-client.js';
import { lesson, unit } from './fixtures.js';

// A stand-in curriculum service on a random port.
const fake = Fastify();
fake.get<{ Params: { id: string } }>('/lessons/:id', async (req, reply) => (req.params.id === lesson.id ? lesson : reply.status(404).send({ error: 'not found' })));
fake.get<{ Params: { id: string } }>('/units/:id', async (req, reply) =>
  req.params.id === unit.id ? unit : req.params.id === 'broken' ? reply.status(500).send({}) : reply.status(404).send({ error: 'not found' }),
);
let client: HttpCurriculumClient;

beforeAll(async () => {
  client = new HttpCurriculumClient(await fake.listen({ port: 0, host: '127.0.0.1' }));
});
afterAll(() => fake.close());

describe('HttpCurriculumClient', () => {
  it('fetches lessons and units', async () => {
    expect(await client.getLesson('u1-l1')).toEqual(lesson);
    expect((await client.getUnit('u1'))?.checkpoint.passPercent).toBe(75);
  });

  it('returns null for unknown ids', async () => {
    expect(await client.getLesson('nope')).toBeNull();
    expect(await client.getUnit('nope')).toBeNull();
  });

  it('reports other failures as 502', async () => {
    await expect(client.getUnit('broken')).rejects.toMatchObject({ statusCode: 502 });
  });
});
