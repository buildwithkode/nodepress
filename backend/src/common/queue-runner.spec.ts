import { QueueRunner } from './queue-runner';

/** An item that stays in flight until resolve() is called. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setImmediate(r));
const CONCURRENCY = 4;

describe('QueueRunner', () => {
  let source: any;
  let runner: QueueRunner<any>;
  let pending: ReturnType<typeof deferred>[];

  beforeEach(() => {
    pending = [];
    source = {
      claimDue: jest.fn(async (limit: number) => Array.from({ length: limit }, (_, i) => ({ id: i }))),
      process: jest.fn(() => {
        const d = deferred();
        pending.push(d);
        return d.promise;
      }),
      failAbandoned: jest.fn().mockResolvedValue(0),
    };
    runner = new QueueRunner(source, { name: 'test', concurrency: CONCURRENCY, pollMs: 60_000 });
    runner.start();
  });

  afterEach(async () => {
    pending.forEach((d) => d.resolve());
    await runner.stop();
  });

  it('never has more than `concurrency` items in flight', async () => {
    await runner.poll();
    expect(source.claimDue).toHaveBeenCalledWith(CONCURRENCY);
    expect(source.process).toHaveBeenCalledTimes(CONCURRENCY);

    await runner.poll(); // all slots busy
    expect(source.claimDue).toHaveBeenCalledTimes(1);
  });

  it('claims more as slots free up while there is a backlog', async () => {
    await runner.poll();
    pending[0].resolve();
    await flush();
    await flush();
    expect(source.claimDue).toHaveBeenLastCalledWith(1);
  });

  it('does not re-poll on completion when the last claim was not full', async () => {
    source.claimDue.mockResolvedValueOnce([{ id: 1 }]);
    await runner.poll();
    pending[0].resolve();
    await flush();
    await flush();
    expect(source.claimDue).toHaveBeenCalledTimes(1);
  });

  it('survives a processor that throws', async () => {
    source.process.mockRejectedValueOnce(new Error('boom'));
    source.claimDue.mockResolvedValueOnce([{ id: 1 }]);
    await runner.poll();
    await flush();
    await runner.poll();
    expect(source.claimDue).toHaveBeenCalledTimes(2);
  });

  it('sweeps abandoned final attempts', async () => {
    await runner.poll();
    expect(source.failAbandoned).toHaveBeenCalled();
  });

  it('stops claiming after stop()', async () => {
    pending.forEach((d) => d.resolve());
    await runner.stop();
    source.claimDue.mockClear();
    await runner.poll();
    expect(source.claimDue).not.toHaveBeenCalled();
  });
});
