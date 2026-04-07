import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Remove existing test form if re-running
  await prisma.form.deleteMany({ where: { slug: 'test-form' } });

  const form = await prisma.form.create({
    data: {
      name:     'Test Form — All Fields',
      slug:     'test-form',
      isActive: true,
      fields: [
        // ── Text inputs ────────────────────────────────────────────────
        { name: 'full_name',  type: 'text',     label: 'Full Name',       required: true,  placeholder: 'e.g. John Doe' },
        { name: 'email',      type: 'email',    label: 'Email Address',   required: true,  placeholder: 'you@example.com' },
        { name: 'phone',      type: 'text',     label: 'Phone Number',    required: false, placeholder: '+1 555 000 0000' },
        { name: 'age',        type: 'number',   label: 'Age',             required: false, placeholder: '25' },
        // ── Textarea ───────────────────────────────────────────────────
        { name: 'message',    type: 'textarea', label: 'Message',         required: true,  placeholder: 'Write your message here…' },
        // ── Select (dropdown) ──────────────────────────────────────────
        { name: 'subject',    type: 'select',   label: 'Subject',         required: true,
          options: ['General Inquiry', 'Support', 'Sales', 'Partnership', 'Other'] },
        // ── Radio (single pick) ────────────────────────────────────────
        { name: 'gender',             type: 'radio', label: 'Gender',                    required: false,
          options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
        { name: 'contact_preference', type: 'radio', label: 'Preferred Contact Method',  required: true,
          options: ['Email', 'Phone', 'WhatsApp'] },
        // ── Checkbox ──────────────────────────────────────────────────
        { name: 'subscribe',   type: 'checkbox', label: 'Subscribe to our newsletter',    required: false },
        { name: 'agree_terms', type: 'checkbox', label: 'I agree to the Terms & Conditions', required: true },
      ] as any,
      actions: [] as any,
    },
  });

  console.log(`✅  Test form created!`);
  console.log(`    ID    : ${form.id}`);
  console.log(`    Slug  : ${form.slug}`);
  console.log(`    Embed : <FormEmbed slug="test-form" />`);
  console.log(`    Submit: POST http://localhost:3000/api/submit/test-form`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
