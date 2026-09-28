import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), 'backend/.env') });

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const targetEmail = args[0]?.trim().toLowerCase() || 'leo9karthik@gmail.com';
  const newPassword = args[1] || 'admin123';

  console.log(`\n🔐 NodePress Admin Password Tool`);
  console.log(`──────────────────────────────────────────`);
  console.log(`Target Email: ${targetEmail}`);

  try {
    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: targetEmail,
          mode: 'insensitive',
        },
      },
    });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: targetEmail,
          password: hashedPassword,
          role: 'admin',
          twoFactorEnabled: false, // reset 2fa in case user got locked out
          twoFactorSecret: null,
          twoFactorRecovery: null,
        },
      });

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
    console.log(`Password: ${newPassword}`);
    console.log(`Role:     admin`);
    console.log(`2FA:      Disabled (clean login)`);
    console.log(`\nYou can now log in at: http://localhost:5173/login\n`);
  } catch (error: any) {
    console.error(`❌ ERROR resetting admin password:`, error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
