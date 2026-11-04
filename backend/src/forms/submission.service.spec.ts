import { SubmissionService } from './submission.service';

const FIELDS = [{ name: 'email', type: 'email', label: 'Email', required: true, unique: true }];

function setup(fields: unknown[] = FIELDS, existing: unknown[] = []) {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(existing),
    formSubmission: { create: jest.fn().mockResolvedValue({ id: 7 }) },
  };
  const forms = { findBySlug: jest.fn().mockResolvedValue({ id: 1, fields, actions: [], captchaEnabled: false }) };
  const actions = { queue: jest.fn().mockResolvedValue(undefined) };
  const service = new SubmissionService(prisma as any, forms as any, actions as any, {} as any);
  return { service, prisma, actions };
}

describe('SubmissionService: unique fields', () => {
  it('saves a value it has not seen', async () => {
    const { service, prisma, actions } = setup();
    const result = await service.submit('newsletter', { email: 'new@example.com' });
    expect(result).toMatchObject({ success: true, submissionId: 7 });
    expect(prisma.formSubmission.create).toHaveBeenCalledTimes(1);
    expect(actions.queue).toHaveBeenCalledTimes(1);
  });

  it('answers a repeat with success, and neither saves it nor fires actions', async () => {
    const { service, prisma, actions } = setup(FIELDS, [{ '?column?': 1 }]);
    const result = await service.submit('newsletter', { email: 'SEEN@example.com' });
    expect(result).toMatchObject({ success: true, submissionId: null });
    expect(prisma.formSubmission.create).not.toHaveBeenCalled();
    expect(actions.queue).not.toHaveBeenCalled();
  });

  it('does not look for repeats of other fields', async () => {
    const { service, prisma } = setup([{ name: 'email', type: 'email', label: 'Email' }], [{ '?column?': 1 }]);
    await service.submit('contact', { email: 'seen@example.com' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.formSubmission.create).toHaveBeenCalledTimes(1);
  });

  it('does not treat an empty optional value as a repeat', async () => {
    const fields = [{ name: 'email', type: 'email', label: 'Email', unique: true }];
    const { service, prisma } = setup(fields, [{ '?column?': 1 }]);
    await service.submit('contact', { email: '' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
