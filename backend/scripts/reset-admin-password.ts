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
  } catch (error: any) {
    console.error(`❌ ERROR resetting admin password:`, error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
