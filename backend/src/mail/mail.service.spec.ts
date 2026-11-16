import { Test, TestingModule } from '@nestjs/testing';
import { env } from '../config/env';
import { MailService } from './mail.service';
import { BrandService } from '../brand/brand.service';

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
      providers: [
        MailService,
        {
          provide: BrandService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              brandName: 'NodePress',
              brandLogoUrl: null,
              brandColor: '#4f46e5',
            }),
          },
        },
      ],
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

  describe('sendRoleChanged()', () => {
    it('says who changed it and before → now, escapes names, and replies to the admin', async () => {
      await service.sendRoleChanged({
        to: 'utsav@example.com',
        recipientName: 'Utsav',
        changedByName: '<b>Karthik</b>',
        changedByEmail: 'karthik@example.com',
        previousRole: 'Editor',
        newRole: 'Admin',
      });

      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.to).toBe('utsav@example.com');
      expect(mail.subject).toBe('Your role on NodePress has changed');
      expect(mail.replyTo).toBe('karthik@example.com');
      expect(mail.text).toContain('Before: Editor\nNow: Admin');
      expect(mail.text).toContain('<b>Karthik</b> (karthik@example.com) changed your role');
      expect(mail.html).toContain('&lt;b&gt;Karthik&lt;/b&gt;');
      expect(mail.html).not.toContain('<b>Karthik</b>');
    });
  });

  describe('account notices', () => {
    const when = new Date('2026-11-16T10:05:00Z');
    const savedSiteUrl = env.SITE_URL;
    beforeEach(() => { (env as any).SITE_URL = 'https://cms.example.com'; });
    afterEach(() => { (env as any).SITE_URL = savedSiteUrl; });

    it('password changed: how and when, a reset button, names escaped', async () => {
      await service.sendPasswordChanged({ to: 'a@example.com', recipientName: '<i>Asha</i>', via: 'profile', when });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your password on NodePress was changed');
      expect(mail.text).toContain('How: From your profile');
      expect(mail.text).toContain('When: Mon, 16 Nov 2026 10:05 UTC');
      expect(mail.text).toContain("Wasn't you? Reset your password: https://cms.example.com/forgot-password");
      expect(mail.html).toContain('&lt;i&gt;Asha&lt;/i&gt;');
      expect(mail.html).not.toContain('<i>Asha</i>');
    });

    it('two-step sign-in off points to the profile to turn it back on', async () => {
      await service.sendTwoFactorChanged({ to: 'a@example.com', recipientName: 'Asha', enabled: false, when });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Two-step sign-in was turned off on NodePress');
      expect(mail.text).toContain('Turn it back on:');
      expect(mail.text).toContain('https://cms.example.com/profile');
    });

    it('server reset lists what the tool did', async () => {
      await service.sendServerReset({ to: 'a@example.com', recipientName: 'Asha', twoFactorWasOn: true, when });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your NodePress account was reset from the server');
      expect(mail.text).toContain('Two-step sign-in: Turned off');
      expect(mail.text).toContain('Sessions: Signed out everywhere');
    });

    it('account removed says who did it and replies go to them', async () => {
      await service.sendAccountRemoved({ to: 'u@example.com', recipientName: 'Utsav', removedByName: 'Karthik', removedByEmail: 'k@example.com', when });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('Your account on NodePress was removed');
      expect(mail.text).toContain('Karthik (k@example.com) removed your account on NodePress.');
      expect(mail.replyTo).toBe('k@example.com');
    });

    it('new admin: who made whom an admin, with the role before', async () => {
      await service.sendNewAdmin({
        to: 'other@example.com', recipientName: 'Priya', newAdminName: 'Utsav', newAdminEmail: 'u@example.com',
        byName: 'Karthik', byEmail: 'k@example.com', how: 'promoted', previousRole: 'Editor', when,
      });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('New admin on NodePress: u@example.com');
      expect(mail.text).toContain('Karthik (k@example.com) made Utsav (u@example.com) an admin on NodePress.');
      expect(mail.text).toContain('Role before: Editor');
      expect(mail.replyTo).toBe('k@example.com');
    });

    it('signed out everywhere offers a password reset', async () => {
      await service.sendSignedOutEverywhere({ to: 'a@example.com', recipientName: 'Asha', when });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('You were signed out on all devices on NodePress');
      expect(mail.text).toContain('https://cms.example.com/forgot-password');
    });

    it('invite accepted says who joined, with which role', async () => {
      await service.sendInviteAccepted({
        to: 'k@example.com', recipientName: 'Karthik', memberName: 'Utsav', memberEmail: 'u@example.com', role: 'Editor', sentByRecipient: true, when,
      });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('u@example.com can now sign in to NodePress');
      expect(mail.text).toContain('Utsav (u@example.com) set a password with the invitation link you sent');
      expect(mail.text).toContain('Role: Editor');
    });

    it('API key created lists the key, access and who did it, with names escaped', async () => {
      await service.sendApiKeyChanged({
        to: 'b@example.com', recipientName: 'Priya', action: 'created', keyName: '<script>x</script>', keyPrefix: 'np_1a2…9f0e',
        access: 'Read only', contentTypes: 'All', byName: 'Karthik', byEmail: 'k@example.com', when,
      });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.subject).toBe('API key created on NodePress: <script>x</script>');
      expect(mail.text).toContain('Karthik (k@example.com) created an API key on NodePress.');
      expect(mail.text).toContain('Key: np_1a2…9f0e');
      expect(mail.html).not.toContain('<script>');
      expect(mail.replyTo).toBe('k@example.com');
    });

    it('new admin from the server tool has no reply-to', async () => {
      await service.sendNewAdmin({
        to: 'other@example.com', recipientName: 'Priya', newAdminName: 'x@example.com', newAdminEmail: 'x@example.com',
        byName: '', byEmail: '', how: 'server', when,
      });
      const mail = mockSendMail.mock.calls[0][0];
      expect(mail.text).toContain('The emergency reset tool on the server made x@example.com an admin');
      expect(mail.replyTo).toBeUndefined();
    });
  });

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

    it('swallows SMTP errors by default', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('421 try later'));
      await expect(service.sendFormSubmission('o@example.com', 'S', { a: 1 })).resolves.toBeUndefined();
    });

    it('rethrows SMTP errors with throwOnError so a queued job can retry', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('421 try later'));
      await expect(
        service.sendFormSubmission('o@example.com', 'S', { a: 1 }, undefined, undefined, { throwOnError: true }),
      ).rejects.toThrow('421 try later');
    });
  });

  // ── no-op when not configured ─────────────────────────────────────────────

  describe('when SMTP is not configured', () => {
    beforeEach(async () => {
      // Re-create service with no SMTP_HOST
      jest.resetModules();
      jest.doMock('../config/env', () => ({ env: { SMTP_HOST: undefined, SMTP_PORT: 587 } }));
      const { MailService: MailServiceNoSMTP } = await import('./mail.service');
      const { BrandService: BrandServiceFresh } = await import('../brand/brand.service');
      const module = await Test.createTestingModule({
        providers: [
          MailServiceNoSMTP,
          {
            provide: BrandServiceFresh,
            useValue: {
              get: jest.fn().mockResolvedValue({
                brandName: 'NodePress',
                brandLogoUrl: null,
                brandColor: '#4f46e5',
              }),
            },
          },
        ],
      }).compile();
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

    it('resolves nested dot/bracket paths', () => {
      const data = { address: { city: 'Mumbai' }, documents: [{ url: 'a.pdf' }] };
      expect(MailService.interpolate('{{address.city}}', data)).toBe('Mumbai');
      expect(MailService.interpolate('{{documents[0].url}}', data)).toBe('a.pdf');
    });

    it('flattens arrays and objects to a readable string', () => {
      expect(MailService.interpolate('{{skills}}', { skills: ['React', 'Next'] })).toBe('React, Next');
      expect(MailService.interpolate('{{addr}}', { addr: { city: 'Mumbai', pincode: 400001 } }))
        .toBe('City: Mumbai, Pincode: 400001');
    });
  });
});
