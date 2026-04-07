/**
 * One-time seed: creates "Test Form - All Fields" via the REST API.
 *
 * Usage (from backend/ directory):
 *   npx ts-node --project tsconfig.json -e "require('./src/forms/seed-test-form')"
 *
 * Or just run it with curl (see bottom of this file).
 *
 * It hits POST /api/forms, so the backend must be running and you need a JWT.
 * Set SEED_TOKEN in your env or paste it below.
 */

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const TOKEN    = process.env.SEED_TOKEN  || '';   // <-- paste your JWT here

const form = {
  name:     'Test Form — All Fields',
  slug:     'test-form',
  isActive: true,

  fields: [
    // ── Text inputs ────────────────────────────────────────────────────────
    {
      name:        'full_name',
      type:        'text',
      label:       'Full Name',
      required:    true,
      placeholder: 'e.g. John Doe',
    },
    {
      name:        'email',
      type:        'email',
      label:       'Email Address',
      required:    true,
      placeholder: 'you@example.com',
    },
    {
      name:        'phone',
      type:        'text',
      label:       'Phone Number',
      required:    false,
      placeholder: '+1 555 000 0000',
    },
    {
      name:        'age',
      type:        'number',
      label:       'Age',
      required:    false,
      placeholder: '25',
    },

    // ── Textarea ───────────────────────────────────────────────────────────
    {
      name:        'message',
      type:        'textarea',
      label:       'Message',
      required:    true,
      placeholder: 'Write your message here…',
    },

    // ── Select (dropdown) ─────────────────────────────────────────────────
    {
      name:     'subject',
      type:     'select',
      label:    'Subject',
      required: true,
      options:  ['General Inquiry', 'Support', 'Sales', 'Partnership', 'Other'],
    },

    // ── Radio (single pick) ───────────────────────────────────────────────
    {
      name:     'gender',
      type:     'radio',
      label:    'Gender',
      required: false,
      options:  ['Male', 'Female', 'Non-binary', 'Prefer not to say'],
    },
    {
      name:     'contact_preference',
      type:     'radio',
      label:    'Preferred Contact Method',
      required: true,
      options:  ['Email', 'Phone', 'WhatsApp'],
    },

    // ── Checkbox ──────────────────────────────────────────────────────────
    {
      name:     'subscribe',
      type:     'checkbox',
      label:    'Subscribe to our newsletter',
      required: false,
    },
    {
      name:     'agree_terms',
      type:     'checkbox',
      label:    'I agree to the Terms & Conditions',
      required: true,
    },
  ],

  actions: [],  // add email/webhook actions here if needed
};

async function seed() {
  if (!TOKEN) {
    console.error('❌  Set SEED_TOKEN env variable to your JWT (login first via POST /api/auth/login)');
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/forms`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(form),
  });

  const json = await res.json();

  if (!res.ok) {
    console.error('❌  Failed:', json);
    process.exit(1);
  }

  console.log('✅  Test form created!');
  console.log(`    ID   : ${json.id}`);
  console.log(`    Slug : ${json.slug}`);
  console.log(`    URL  : ${BASE_URL}/api/forms/${json.id}`);
  console.log(`    Submit: POST ${BASE_URL}/api/submit/${json.slug}`);
  console.log(`    Embed : <FormEmbed slug="${json.slug}" />`);
}

seed().catch(console.error);
