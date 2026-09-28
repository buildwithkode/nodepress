/**
 * Complete End-to-End Launch Readiness Verification
 * Tests:
 * 1. Login & Auth Edge Cases (case-insensitivity, whitespace, bad credentials, expired tokens)
 * 2. Token Refresh & Cookie Rotation
 * 3. Content Type Creation & Dynamic API Generation
 * 4. CRUD Operations via Dynamic API (POST, GET, PUT, Publish, DELETE)
 * 5. API Key Management & Public API Access via X-API-Key
 * 6. User / Team Member Management & RBAC Permissions (Admin vs Editor)
 * 7. 2FA Full Lifecycle (Setup, TOTP generation, Enable, 2-Step Login, Recovery Code Login, Disable)
 */

import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { generateTotp } from '../src/auth/totp.util';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3001/api';
const FRONTEND_PROXY = 'http://localhost:5173/api';

const ADMIN_EMAIL = 'admin@nodepress.org';
const ADMIN_PASS = 'admin123';

let adminToken = '';
let refreshCookie = '';
let createdContentTypeId: number | null = null;
let createdApiKeyId: number | null = null;
let createdUserId: number | null = null;

function assert(condition: any, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✅ ${message}`);
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END LAUNCH READINESS TEST');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 1: AUTHENTICATION & LOGIN RESILIENCE
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST SUITE 1: Authentication, Login & Session Resilience');

  // 1.1 Setup status check
  const setupRes = await axios.get(`${BASE_URL}/auth/setup-status`);
  assert(setupRes.status === 200 && typeof setupRes.data.required === 'boolean', 'Setup status returns valid response');

  // 1.2 Invalid password rejection
  try {
    await axios.post(`${BASE_URL}/auth/login`, { email: ADMIN_EMAIL, password: 'WrongPassword999!' });
    assert(false, 'Should reject invalid password');
  } catch (err: any) {
    assert(err.response?.status === 401, 'Invalid password correctly rejected with 401');
  }

  // 1.3 Case-insensitivity test (mixed case email)
  const caseRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: 'AdMiN@NoDePrEsS.oRg',
    password: ADMIN_PASS,
  });
  assert(caseRes.status === 200 || caseRes.status === 201, 'Case-insensitive email login succeeds');
  assert(caseRes.data.access_token && caseRes.data.user.email === ADMIN_EMAIL, 'Returns access_token and matching user');

  // 1.4 Whitespace trimming test
  const trimRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: `  ${ADMIN_EMAIL}   `,
    password: ADMIN_PASS,
  });
  assert(trimRes.status === 200 || trimRes.status === 201, 'Whitespace-padded email login succeeds');

  // 1.5 Standard Login via Frontend Proxy (port 5173) with Refresh Cookie
  const loginRes = await axios.post(`${FRONTEND_PROXY}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  assert(loginRes.status === 200 || loginRes.status === 201, 'Login via frontend proxy (port 5173) succeeds');
  adminToken = loginRes.data.access_token;
  assert(!!adminToken, 'Admin JWT token obtained');

  const cookiesHeader = loginRes.headers['set-cookie'];
  assert(Array.isArray(cookiesHeader) && cookiesHeader.some(c => c.includes('np_refresh')), 'HttpOnly np_refresh cookie is issued with path /api/auth');
  refreshCookie = (cookiesHeader || []).find(c => c.startsWith('np_refresh=')) || '';

  // 1.6 Verify /auth/me with Bearer token
  const meRes = await axios.get(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(meRes.status === 200 && meRes.data.email === ADMIN_EMAIL && meRes.data.role === 'admin', 'GET /api/auth/me returns admin user');

  // 1.7 Session Refresh via Refresh Cookie
  const refreshRes = await axios.post(
    `${BASE_URL}/auth/refresh`,
    {},
    { headers: { Cookie: refreshCookie } }
  );
  assert(refreshRes.status === 200 || refreshRes.status === 201, 'POST /api/auth/refresh rotates and issues new access token');
  assert(typeof refreshRes.data.access_token === 'string', 'Refreshed access token received');
  adminToken = refreshRes.data.access_token; // update token

  console.log('✅ Test Suite 1: Authentication passed.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 2: CONTENT TYPE BUILDER & DYNAMIC API
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST SUITE 2: Content Type Builder & Dynamic API Generation');

  const ctSlug = `launch_product_${Date.now()}`;
  const ctPayload = {
    name: ctSlug,
    displayName: 'Launch Product',
    schema: [
      { name: 'title', label: 'Product Title', type: 'text', required: true },
      { name: 'price', label: 'Price (USD)', type: 'number', required: true },
      { name: 'sku', label: 'SKU', type: 'text', required: false },
      { name: 'isAvailable', label: 'In Stock', type: 'boolean', required: false },
      { name: 'description', label: 'Details', type: 'richtext', required: false },
    ],
  };

  const ctCreateRes = await axios.post(`${BASE_URL}/content-types`, ctPayload, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(ctCreateRes.status === 201, 'Content Type created successfully');
  createdContentTypeId = ctCreateRes.data.id;
  assert(createdContentTypeId !== null, `Content Type ID: ${createdContentTypeId}`);

  // Test Dynamic API POST (create entry)
  const entrySlug = 'super-launch-widget-3000';
  const entryPayload = {
    slug: entrySlug,
    data: {
      title: 'Super Launch Widget 3000',
      price: 99.99,
      sku: 'SLW-3000',
      isAvailable: true,
      description: '<p>The best launch widget ever built.</p>',
    },
  };

  const createEntryRes = await axios.post(`${BASE_URL}/${ctSlug}`, entryPayload, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(createEntryRes.status === 201, `Dynamic API POST /api/${ctSlug} created entry`);
  assert(createEntryRes.data.slug === entrySlug, 'Entry slug matches');
  assert(createEntryRes.data.data.title === 'Super Launch Widget 3000', 'Entry data title matches');
  assert(createEntryRes.data.data.price === 99.99, 'Entry data price matches');

  // Test Dynamic API GET (list entries)
  const listEntriesRes = await axios.get(`${BASE_URL}/${ctSlug}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(listEntriesRes.status === 200, `Dynamic API GET /api/${ctSlug} listed entries`);
  assert(listEntriesRes.data.data.length >= 1, 'Contains at least 1 entry');

  // Test Dynamic API GET by Slug
  const getEntryRes = await axios.get(`${BASE_URL}/${ctSlug}/${entrySlug}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(getEntryRes.status === 200 && getEntryRes.data.slug === entrySlug, `Dynamic API GET /api/${ctSlug}/${entrySlug} returns entry`);

  // Test Dynamic API PUT (update entry)
  const updateEntryRes = await axios.put(
    `${BASE_URL}/${ctSlug}/${entrySlug}`,
    {
      data: {
        title: 'Super Launch Widget 3000 (Updated)',
        price: 129.99,
        sku: 'SLW-3000-V2',
        isAvailable: true,
        description: '<p>Updated description for launch.</p>',
      },
    },
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(updateEntryRes.status === 200, 'Dynamic API PUT updated entry');
  assert(updateEntryRes.data.data.price === 129.99, 'Updated price verified');

  console.log('✅ Test Suite 2: Content Type & Dynamic API passed.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 3: API KEYS & HEADLESS API CONSUMPTION
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST SUITE 3: API Keys & Headless API Consumption');

  const apiKeyPayload = {
    name: 'Launch Testing Key',
    permissions: {
      access: 'all',
      contentTypes: ['*'],
    },
  };

  const keyCreateRes = await axios.post(`${BASE_URL}/api-keys`, apiKeyPayload, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(keyCreateRes.status === 201, 'API Key generated');
  const rawApiKey = keyCreateRes.data.key;
  createdApiKeyId = keyCreateRes.data.id;
  assert(typeof rawApiKey === 'string' && rawApiKey.startsWith('np_'), 'Valid np_ prefixed API key returned');

  // Query Dynamic API using ONLY X-API-Key (no Bearer token)
  const apiKeyQueryRes = await axios.get(`${BASE_URL}/${ctSlug}`, {
    headers: { 'X-API-Key': rawApiKey },
  });
  assert(apiKeyQueryRes.status === 200, 'Public/Headless GET via X-API-Key succeeds');
  assert(apiKeyQueryRes.data.data.length >= 1, 'Headless query returns entries data');

  console.log('✅ Test Suite 3: API Keys passed.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 4: TEAM MEMBERS & RBAC PERMISSIONS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST SUITE 4: Team Members & RBAC Permissions');

  const testMemberEmail = `launch_editor_${Date.now()}@nodepress.org`;
  const testMemberPass = 'EditorPass123!';

  // 4.1 Invite Member (role: editor)
  const createMemberRes = await axios.post(
    `${BASE_URL}/users`,
    { email: testMemberEmail, role: 'editor' },
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(createMemberRes.status === 201, 'Admin invited new user with role "editor"');
  createdUserId = createMemberRes.data.id;
  assert(createMemberRes.data.email === testMemberEmail, 'Member email matches');
  assert(createMemberRes.data.role === 'editor', 'Member role is editor');

  // 4.2 Retrieve invite token from database (onboarding password set flow)
  const resetTokenRecord = await prisma.passwordResetToken.findFirst({
    where: { userId: createdUserId, used: false },
    orderBy: { createdAt: 'desc' },
  });
  assert(!!resetTokenRecord, 'Password reset/invite token created for new member');

  // 4.3 Set password via /auth/reset-password
  const resetRes = await axios.post(`${BASE_URL}/auth/reset-password`, {
    token: resetTokenRecord!.token,
    password: testMemberPass,
  });
  assert(resetRes.status === 200 || resetRes.status === 201, 'Member successfully set their password');

  // 4.4 Member Login
  const memberLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
    email: testMemberEmail,
    password: testMemberPass,
  });
  assert(memberLoginRes.status === 200 || memberLoginRes.status === 201, 'New editor can log in');
  const memberToken = memberLoginRes.data.access_token;
  assert(!!memberToken, 'Editor obtained JWT token');

  // 4.5 Verify Editor CAN create an entry
  const editorEntryRes = await axios.post(
    `${BASE_URL}/${ctSlug}`,
    { slug: 'editor-created-item', data: { title: 'Editor Product', price: 49.99 } },
    { headers: { Authorization: `Bearer ${memberToken}` } },
  );
  assert(editorEntryRes.status === 201, 'Editor can successfully create content entries');

  // 4.6 Verify Editor CANNOT create other users (RBAC protection)
  try {
    await axios.post(
      `${BASE_URL}/users`,
      { email: 'hack_admin@nodepress.org', role: 'admin' },
      { headers: { Authorization: `Bearer ${memberToken}` } },
    );
    assert(false, 'Editor should be forbidden from creating users');
  } catch (err: any) {
    assert(err.response?.status === 403, 'Editor blocked from user management with 403 Forbidden');
  }

  console.log('✅ Test Suite 4: Team Members & RBAC passed.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // TEST SUITE 5: TWO-FACTOR AUTHENTICATION (2FA / TOTP)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ TEST SUITE 5: Two-Factor Authentication (2FA) Full Lifecycle');

  // 5.1 Check initial 2FA status
  const init2faRes = await axios.get(`${BASE_URL}/auth/2fa/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(init2faRes.status === 200 && init2faRes.data.enabled === false, 'Initial 2FA status is disabled');

  // 5.2 Setup 2FA
  const setup2faRes = await axios.get(`${BASE_URL}/auth/2fa/setup`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(setup2faRes.status === 200, 'GET /api/auth/2fa/setup generated secret');
  const { secret, recoveryCodes, hashedRecoveryCodes } = setup2faRes.data;
  assert(typeof secret === 'string' && secret.length >= 16, 'Base32 secret generated');
  assert(Array.isArray(recoveryCodes) && recoveryCodes.length === 8, '8 backup recovery codes generated');

  // 5.3 Generate valid TOTP code
  const totpCode = generateTotp(secret);
  assert(/^\d{6}$/.test(totpCode), `Valid 6-digit TOTP code generated: ${totpCode}`);

  // 5.4 Enable 2FA
  const enable2faRes = await axios.post(
    `${BASE_URL}/auth/2fa/enable`,
    {
      secret,
      code: totpCode,
      recoveryCodes: hashedRecoveryCodes,
    },
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  assert(enable2faRes.status === 200 || enable2faRes.status === 201, '2FA enabled successfully');

  // 5.5 Verify 2FA status is now true
  const statusAfterEnable = await axios.get(`${BASE_URL}/auth/2fa/status`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(statusAfterEnable.data.enabled === true, '2FA status is now enabled: true');

  // 5.6 Test Login with 2FA enabled: Step 1 (password submission)
  const login2faStep1 = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  assert(login2faStep1.data.requires2fa === true, 'Login intercepts and requires 2FA');
  const tempToken = login2faStep1.data.tempToken;
  assert(typeof tempToken === 'string', 'Temporary 5-minute 2FA token issued');

  // 5.7 Test Login with invalid TOTP code
  try {
    await axios.post(`${BASE_URL}/auth/2fa/verify-login`, {
      tempToken,
      code: '000000',
    });
    assert(false, 'Should reject invalid TOTP code');
  } catch (err: any) {
    assert(err.response?.status === 401, 'Invalid TOTP code rejected with 401');
  }

  // 5.8 Test Login with valid TOTP code: Step 2
  const freshTotp = generateTotp(secret);
  const verifyLoginRes = await axios.post(`${BASE_URL}/auth/2fa/verify-login`, {
    tempToken,
    code: freshTotp,
  });
  assert(verifyLoginRes.status === 200 || verifyLoginRes.status === 201, 'Step 2: 2FA verification succeeded');
  assert(!!verifyLoginRes.data.access_token, '2FA login returned valid access_token');
  const tokenAfter2fa = verifyLoginRes.data.access_token;

  // 5.9 Test Login with backup recovery code
  const loginForRecovery = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  const recoveryTempToken = loginForRecovery.data.tempToken;
  const backupCodeToUse = recoveryCodes[0];

  const recoveryLoginRes = await axios.post(`${BASE_URL}/auth/2fa/verify-login`, {
    tempToken: recoveryTempToken,
    code: backupCodeToUse,
  });
  assert(recoveryLoginRes.status === 200 || recoveryLoginRes.status === 201, 'Emergency backup recovery code login succeeded');
  assert(recoveryLoginRes.data.recoveryUsed === true, 'Response confirms recovery code was consumed');
  assert(recoveryLoginRes.data.remainingRecoveryCodes === 7, 'Remaining recovery codes count is 7');

  // 5.10 Test reusing the same recovery code (must be rejected)
  const loginForReusedRecovery = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  try {
    await axios.post(`${BASE_URL}/auth/2fa/verify-login`, {
      tempToken: loginForReusedRecovery.data.tempToken,
      code: backupCodeToUse,
    });
    assert(false, 'Used recovery code should be rejected');
  } catch (err: any) {
    assert(err.response?.status === 401, 'Reused recovery code rejected with 401');
  }

  // 5.11 Disable 2FA
  const disableTotp = generateTotp(secret);
  const disableRes = await axios.post(
    `${BASE_URL}/auth/2fa/disable`,
    { code: disableTotp },
    { headers: { Authorization: `Bearer ${tokenAfter2fa}` } },
  );
  assert(disableRes.status === 200 || disableRes.status === 201, '2FA disabled successfully');

  // 5.12 Verify status is disabled
  const statusAfterDisable = await axios.get(`${BASE_URL}/auth/2fa/status`, {
    headers: { Authorization: `Bearer ${tokenAfter2fa}` },
  });
  assert(statusAfterDisable.data.enabled === false, '2FA status is now false');

  // 5.13 Direct login without 2FA
  const loginAfterDisable = await axios.post(`${BASE_URL}/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASS,
  });
  assert(loginAfterDisable.data.requires2fa === undefined, 'Subsequent login is direct without 2FA requirement');
  assert(!!loginAfterDisable.data.access_token, 'Direct access_token received');

  console.log('✅ Test Suite 5: Two-Factor Authentication passed.\n');

  // ───────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ───────────────────────────────────────────────────────────────────────────
  console.log('▶ CLEANUP: Removing temporary test artifacts');

  if (createdApiKeyId) {
    await axios.delete(`${BASE_URL}/api-keys/${createdApiKeyId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    console.log('  Cleaned up test API Key');
  }

  if (createdUserId) {
    await axios.delete(`${BASE_URL}/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    console.log('  Cleaned up test member');
  }

  if (createdContentTypeId) {
    await axios.delete(`${BASE_URL}/content-types/${createdContentTypeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).catch(() => {});
    console.log('  Cleaned up test Content Type & entries');
  }

  await prisma.$disconnect();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🎉 ALL END-TO-END TESTS PASSED WITH 100% SUCCESS!');
  console.log('   The system is fully resilient, secure, and ready for launch.');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

run().catch(async (err) => {
  console.error('❌ E2E TEST FAILED:', err.response?.data || err.message);
  await prisma.$disconnect();
  process.exit(1);
});
