import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';

// Stub the env module so tests don't need real env vars
jest.mock('../config/env', () => ({
  env: {
    SMTP_HOST:   'smtp.test.local',
    SMTP_PORT:   587,
    SMTP_SECURE: 'false',
    SMTP_USER:   'user@test.local',
    SMTP_PASS:   'secret',
    SMTP_FROM:   'NodePress <noreply@test.local>',
  },
}));

// Stub nodemailer so no real SMTP connections are made
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });
const mockVerify   = jest.fn().mockResolvedValue(true);
const mockTransporter = { sendMail: mockSendMail, verify: mockVerify };

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

describe('MailService', () => {
  let service: MailService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
    }).compile();
    service = module.get<MailService>(MailService);
    service.onModuleInit(); // trigger transporter creation
  });

  // ── isConfigured ──────────────────────────────────────────────────────────

  it('isConfigured is true when SMTP_HOST is set', () => {
    expect(service.isConfigured).toBe(true);
  });

  // ── sendPasswordReset ─────────────────────────────────────────────────────

  describe('sendPasswordReset()', () => {
    it('calls sendMail with correct to + subject', async () => {
      await service.sendPasswordReset('user@example.com', 'https://app.local/reset?token=abc');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to:      'user@example.com',
          subject: 'Reset your NodePress password',
        }),
      );
    });

    it('embeds the reset URL in both text and html', async () => {
      const url = 'https://app.local/reset?token=xyz';
      await service.sendPasswordReset('user@example.com', url);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain(url);
      expect(call.html).toContain(url);
    });
  });

  // ── sendInvitation ───────────────────────────────────────────────────────

  describe('sendInvitation()', () => {
    it('calls sendMail with invitation subject and set-password URL', async () => {
      const url = 'https://app.local/reset-password?token=invite123';
      await service.sendInvitation('newuser@example.com', url, 'admin@example.com');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to:      'newuser@example.com',
          subject: `You've been invited to NodePress`,
        }),
      );
      const call = mockSendMail.mock.calls[0][0];
      expect(call.text).toContain(url);
      expect(call.html).toContain(url);
      expect(call.text).toContain('admin@example.com');
    });
  });

  // ── sendFormSubmission ────────────────────────────────────────────────────

  describe('sendFormSubmission()', () => {
    it('sends email with subject and field rows', async () => {
      await service.sendFormSubmission(
        'owner@example.com',
        'New contact from {{name}}',
        { name: 'Alice', message: 'Hello' },
      );
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to:      'owner@example.com',
          subject: 'New contact from {{name}}', // interpolation done by caller
        }),
      );
      const { html } = mockSendMail.mock.calls[0][0];
      expect(html).toContain('Alice');
      expect(html).toContain('Hello');
    });

    it('sets replyTo when provided', async () => {
      await service.sendFormSubmission(
        'owner@example.com',
        'Submission',
        { email: 'alice@example.com' },
        'alice@example.com',
      );
      const call = mockSendMail.mock.calls[0][0];
      expect(call.replyTo).toBe('alice@example.com');
    });
  });

  // ── no-op when not configured ─────────────────────────────────────────────

  describe('when SMTP is not configured', () => {
    beforeEach(async () => {
      // Re-create service with no SMTP_HOST
      jest.resetModules();
      jest.doMock('../config/env', () => ({ env: { SMTP_HOST: undefined, SMTP_PORT: 587 } }));
      const { MailService: MailServiceNoSMTP } = await import('./mail.service');
      const module = await Test.createTestingModule({ providers: [MailServiceNoSMTP] }).compile();
      service = module.get(MailServiceNoSMTP);
      service.onModuleInit();
    });

    it('isConfigured is false', () => {
      expect(service.isConfigured).toBe(false);
    });

    it('sendPasswordReset does not throw', async () => {
      await expect(service.sendPasswordReset('x@x.com', 'https://x.com/reset')).resolves.not.toThrow();
    });

    it('sendFormSubmission does not throw', async () => {
      await expect(service.sendFormSubmission('x@x.com', 'Test', {})).resolves.not.toThrow();
    });
  });

  // ── interpolate (static) ──────────────────────────────────────────────────

  describe('MailService.interpolate()', () => {
    it('replaces known tokens', () => {
      expect(MailService.interpolate('Hello {{name}}!', { name: 'Bob' })).toBe('Hello Bob!');
    });

    it('leaves unknown tokens intact', () => {
      expect(MailService.interpolate('Hello {{missing}}!', {})).toBe('Hello {{missing}}!');
    });

    it('handles multiple tokens', () => {
      expect(
        MailService.interpolate('{{greeting}} {{name}}', { greeting: 'Hi', name: 'Eve' }),
      ).toBe('Hi Eve');
    });
  });
});
