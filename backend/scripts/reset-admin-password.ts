import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { assertAcceptablePassword, hashPassword } from '../src/auth/password';

dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), 'backend/.env') });

const prisma = new PrismaClient();

/**
 * Emergency admin access from the server's terminal:
 *
 *   npm run reset-password -- <email>              # prints a new random password
 *   npm run reset-password -- <email> <password>   # sets that password (same rules as the admin)
 *
 * Makes the account an admin, turns 2FA off and signs it out everywhere.
 * Creates the account when the email has none.
 */
async function main() {
  const [emailArg, passwordArg] = process.argv.slice(2);
  const targetEmail = emailArg?.trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes('@')) {
    console.error('Usage: npm run reset-password -- <email> [new password]');
    process.exit(1);
  }

  // No password given: a random one nobody has seen, shown once below
  const generated = !passwordArg;
  const newPassword = passwordArg ?? randomBytes(15).toString('base64url');

  console.log(`\n🔐 NodePress Admin Password Tool`);
  console.log(`──────────────────────────────────────────`);
  console.log(`Target Email: ${targetEmail}`);

  try {
    if (!generated) await assertAcceptablePassword(newPassword, targetEmail);

    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: targetEmail,
          mode: 'insensitive',
        },
      },
    });

    const hashedPassword = await hashPassword(newPassword);

    if (existing) {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: existing.id },
          data: {
            email: targetEmail,
            password: hashedPassword,
            role: 'admin',
            twoFactorEnabled: false, // reset 2fa in case user got locked out
            twoFactorSecret: null,
            twoFactorRecovery: null,
            sessionVersion: { increment: 1 }, // sign out every existing session
          },
        }),
        prisma.refreshToken.deleteMany({ where: { userId: existing.id } }),
      ]);

      console.log(`✅ SUCCESS: Admin password updated for ${targetEmail}`);
    } else {
      await prisma.user.create({
        data: {
          email: targetEmail,
          password: hashedPassword,
          role: 'admin',
        },
      });

      console.log(`✅ SUCCESS: Created new admin user: ${targetEmail}`);
    }

    console.log(`──────────────────────────────────────────`);
    console.log(`Email:    ${targetEmail}`);
    if (generated) console.log(`Password: ${newPassword}   (shown once — change it after signing in)`);
    else console.log(`Password: the one you entered`);
    console.log(`Role:     admin`);
    console.log(`2FA:      Disabled (clean login)`);
    console.log(`Sessions: signed out everywhere\n`);

    await sendNotices({
      email: targetEmail,
      name: existing?.name ?? null,
      existed: !!existing,
      twoFactorWasOn: !!existing?.twoFactorEnabled,
      previousRole: existing?.role,
    });
  } catch (error: any) {
    console.error(`❌ ERROR resetting admin password:`, error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Tell the account's owner what the tool did (when the account already
 * existed) and every other admin when someone became an admin. Only when email
 * is set up; a mail problem never undoes or fails the reset.
 */
async function sendNotices(t: { email: string; name: string | null; existed: boolean; twoFactorWasOn: boolean; previousRole?: string }) {
  let mail: import('../src/mail/mail.service').MailService | undefined;
  try {
    const { MailService } = await import('../src/mail/mail.service');
    const { BrandService } = await import('../src/brand/brand.service');
    const db = prisma as any;
    mail = new MailService(new BrandService(db), db);
    await mail.start();
    if (!mail.isConfigured) {
      console.log('Email:    not set up — nobody was notified\n');
      return;
    }
    const when = new Date();
    const greet = (u: { email: string; name?: string | null }) => u.name?.trim() || u.email.split('@')[0];
    let sent = 0;
    if (t.existed) {
      await mail.sendServerReset({ to: t.email, recipientName: greet(t), twoFactorWasOn: t.twoFactorWasOn, when });
      sent++;
    }
    if (t.previousRole !== 'admin') {
      const admins = await prisma.user.findMany({
        where: { role: 'admin', email: { not: t.email } },
        select: { email: true, name: true },
      });
      for (const admin of admins) {
        await mail.sendNewAdmin({
          to: admin.email,
          recipientName: greet(admin),
          newAdminName: t.name?.trim() || t.email,
          newAdminEmail: t.email,
          byName: '',
          byEmail: '',
          how: 'server',
          previousRole: t.previousRole ? t.previousRole.charAt(0).toUpperCase() + t.previousRole.slice(1) : undefined,
          when,
        });
        sent++;
      }
    }
    console.log(`Email:    ${sent} notice${sent === 1 ? '' : 's'} handed to the mail server (a failure is logged above)\n`);
  } catch (err: any) {
    console.warn(`Email:    could not send notices (${err?.message ?? err}) — the reset itself is done\n`);
  } finally {
    mail?.close();
  }
}

main();
