import { JobsService, ClaimedJob } from './jobs.service';

const job = (over: Partial<ClaimedJob> = {}): ClaimedJob => ({
  id: 1, type: 'test.job', payload: { x: 1 }, attempts: 1, maxAttempts: 3, ...over,
});

describe('JobsService', () => {
  let prisma: any;
  let jobs: JobsService;

  beforeEach(() => {
    prisma = {
      job: {
        createMany: jest.fn(async ({ data }: any) => ({ count: data.length })),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    jobs = new JobsService(prisma);
  });

  it('enqueue inserts a pending job due now (explicit UTC runAt) and wakes the worker', async () => {
    const wake = jest.fn();
    jobs.onEnqueue(wake);
    const before = Date.now();
    expect(await jobs.enqueue('test.job', { x: 1 })).toBe(1);
    const [row] = prisma.job.createMany.mock.calls[0][0].data;
    expect(row).toMatchObject({ type: 'test.job', payload: { x: 1 }, maxAttempts: 3 });
    expect(row.runAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(wake).toHaveBeenCalled();
  });

  it('enqueueMany with nothing to queue does not touch the database', async () => {
    expect(await jobs.enqueueMany([])).toBe(0);
    expect(prisma.job.createMany).not.toHaveBeenCalled();
  });

  it('rejects registering the same job type twice', () => {
    jobs.registerHandler('a', async () => undefined);
    expect(() => jobs.registerHandler('a', async () => undefined)).toThrow(/already registered/);
  });

  it('marks a job done when its handler succeeds', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    jobs.registerHandler('test.job', handler);
    await jobs.process(job());
    expect(handler).toHaveBeenCalledWith({ x: 1 }, expect.objectContaining({ id: 1 }));
    expect(prisma.job.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'done', lastError: null } });
  });

  it('reschedules a failed attempt with backoff', async () => {
    jobs.registerHandler('test.job', async () => { throw new Error('smtp down'); });
    const before = Date.now();
    await jobs.process(job({ attempts: 1 }));
    const { data } = prisma.job.update.mock.calls[0][0];
    expect(data.lastError).toBe('smtp down');
    expect(data.status).toBeUndefined(); // stays pending
    expect(data.runAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
  });

  it('fails the job after its last attempt', async () => {
    jobs.registerHandler('test.job', async () => { throw new Error('smtp down'); });
    await jobs.process(job({ attempts: 3 }));
    expect(prisma.job.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: 'failed', lastError: 'smtp down' } });
  });

  it('fails a job with no registered handler', async () => {
    await jobs.process(job({ type: 'unknown' }));
    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'failed', lastError: 'No handler registered for job type "unknown"' },
    });
  });

  it('never throws when recording the outcome fails', async () => {
    jobs.registerHandler('test.job', async () => undefined);
    prisma.job.update.mockRejectedValueOnce(new Error('db down'));
    await expect(jobs.process(job())).resolves.toBeUndefined();
  });
});
