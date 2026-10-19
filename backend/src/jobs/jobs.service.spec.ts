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
        update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
        updateMany: jest.fn(async () => ({ count: 2 })),
        findUnique: jest.fn(),
        delete: jest.fn(),
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

  describe('admin actions', () => {
    it('retry resets attempts, makes the job due now and wakes the worker', async () => {
      const wake = jest.fn();
      jobs.onEnqueue(wake);
      prisma.job.findUnique.mockResolvedValue({ id: 4, status: 'failed' });
      const before = Date.now();
      await jobs.retry(4);
      const { data } = prisma.job.update.mock.calls[0][0];
      expect(data).toMatchObject({ status: 'pending', attempts: 0 });
      expect(data.runAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(wake).toHaveBeenCalled();
    });

    it('retry refuses a job that already succeeded, and unknown ids', async () => {
      prisma.job.findUnique.mockResolvedValueOnce({ id: 4, status: 'done' });
      await expect(jobs.retry(4)).rejects.toThrow(/already succeeded/);
      prisma.job.findUnique.mockResolvedValueOnce(null);
      await expect(jobs.retry(5)).rejects.toThrow(/not found/);
    });

    it('retryFailed requeues only failed jobs, optionally of one type', async () => {
      expect(await jobs.retryFailed('form.email')).toEqual({ requeued: 2 });
      expect(prisma.job.updateMany).toHaveBeenCalledWith({
        where: { status: 'failed', type: 'form.email' },
        data: expect.objectContaining({ status: 'pending', attempts: 0 }),
      });
    });

    it('remove deletes finished jobs but never a pending one', async () => {
      prisma.job.findUnique.mockResolvedValueOnce({ status: 'pending' });
      await expect(jobs.remove(1)).rejects.toThrow(/may be running/);
      expect(prisma.job.delete).not.toHaveBeenCalled();

      prisma.job.findUnique.mockResolvedValueOnce({ status: 'failed' });
      await jobs.remove(2);
      expect(prisma.job.delete).toHaveBeenCalledWith({ where: { id: 2 } });
    });
  });
});
