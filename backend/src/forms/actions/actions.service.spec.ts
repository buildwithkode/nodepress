import { ActionsService, FORM_EMAIL_JOB, FORM_WEBHOOK_JOB } from './actions.service';

describe('ActionsService', () => {
  let jobs: any;
  let email: any;
  let webhook: any;
  let service: ActionsService;
  const handlers = new Map<string, (p: any) => Promise<void>>();

  beforeEach(() => {
    handlers.clear();
    jobs = {
      registerHandler: jest.fn((type: string, fn: any) => handlers.set(type, fn)),
      enqueueMany: jest.fn(async (list: any[]) => list.length),
    };
    email = { handle: jest.fn() };
    webhook = { handle: jest.fn() };
    service = new ActionsService(jobs, email, webhook);
    service.onModuleInit();
  });

  it('queues one job per action with a snapshot payload, instead of running them inline', async () => {
    const actions: any[] = [
      { type: 'email', to: 'owner@example.com', subject: 'New {{name}}' },
      { type: 'webhook', url: 'https://example.com/hook' },
    ];
    const fields: any[] = [{ name: 'name', type: 'text', label: 'Name', required: true }];

    const queued = await service.queue(actions, { name: 'Ann' }, { formId: 2, submissionId: 9 }, fields);

    expect(queued).toBe(2);
    expect(jobs.enqueueMany).toHaveBeenCalledWith([
      { type: FORM_EMAIL_JOB, payload: { formId: 2, submissionId: 9, action: actions[0], data: { name: 'Ann' }, fields: [{ name: 'name', label: 'Name' }] } },
      { type: FORM_WEBHOOK_JOB, payload: expect.objectContaining({ action: actions[1] }) },
    ]);
    expect(email.handle).not.toHaveBeenCalled();
    expect(webhook.handle).not.toHaveBeenCalled();
  });

  it('ignores unknown action types', async () => {
    await service.queue([{ type: 'sms' } as any], {}, { formId: 1, submissionId: 1 });
    expect(jobs.enqueueMany).toHaveBeenCalledWith([]);
  });

  it('registered handlers run the matching action handler', async () => {
    const action = { type: 'email', to: 'a@b.c', subject: 's' };
    await handlers.get(FORM_EMAIL_JOB)!({ action, data: { a: 1 }, fields: [] });
    expect(email.handle).toHaveBeenCalledWith(action, { a: 1 }, []);

    const hook = { type: 'webhook', url: 'https://x' };
    await handlers.get(FORM_WEBHOOK_JOB)!({ action: hook, data: { a: 1 } });
    expect(webhook.handle).toHaveBeenCalledWith(hook, { a: 1 });
  });
});
