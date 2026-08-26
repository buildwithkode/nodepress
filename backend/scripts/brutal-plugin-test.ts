import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PluginService } from '../src/plugin/plugin.service';
import { PluginRegistry } from '../src/plugin/plugin.registry';
import { PluginHookBus } from '../src/plugin/plugin-hook-bus';
import { PluginEvents } from '../src/plugin/plugin.events';
import { EntriesService } from '../src/entries/entries.service';
import { ContentTypeService } from '../src/content-type/content-type.service';
import { PrismaService } from '../src/prisma/prisma.service';

interface TestResult {
  scenario: string;
  category: string;
  passed: boolean;
  durationMs: number;
  details: string;
  score: number; // 0-10
}

async function runBrutalTestSuite() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(' 🔥 [NODEPRESS BRUTAL PLUGIN STRESS & SECURITY TEST SUITE] 🔥');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  const startTime = Date.now();
  const results: TestResult[] = [];

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pluginService = app.get(PluginService);
  const registry = app.get(PluginRegistry);
  const hookBus = app.get(PluginHookBus);
  const prisma = app.get(PrismaService);
  const entriesService = app.get(EntriesService);
  const contentTypeService = app.get(ContentTypeService);

  function record(scenario: string, category: string, passed: boolean, durationMs: number, details: string, score: number) {
    results.push({ scenario, category, passed, durationMs, details, score });
    const statusIcon = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${statusIcon}] (${durationMs}ms) [${category}] ${scenario}`);
    console.log(`       ↳ Details: ${details}`);
    console.log(`       ↳ Security/Stability Score: ${score}/10\n`);
  }

  // Ensure test content type exists
  let testType = await prisma.contentType.findUnique({ where: { name: 'brutal_test' } });
  if (!testType) {
    testType = await contentTypeService.create({
      name: 'brutal_test',
      displayName: 'Brutal Test',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext', required: false },
      ],
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 1: CRASH ISOLATION — SYNCHRONOUS FATAL THROW
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const rogueId = 'rogue-sync-crasher';
    registry.register({
      manifest: {
        id: rogueId,
        name: 'Rogue Sync Crasher',
        version: '1.0.0',
        description: 'Deliberately throws fatal unhandled exception',
        permissions: ['entries:write'],
      },
      module: class DummyModule {},
      enabled: true,
      config: {},
    });

    hookBus.on(
      PluginEvents.ENTRY_BEFORE_CREATE,
      () => {
        throw new Error('💥 FATAL_SYNCHRONOUS_PLUGIN_EXPLOSION');
      },
      1,
      rogueId,
      'entries:write',
    );

    let errorThrown = false;
    let entryCreated = false;
    let testEntryId: number | undefined;

    try {
      const entry = await entriesService.create({
        contentTypeId: testType.id,
        slug: `test-sync-crash-${Date.now()}`,
        status: 'published',
        data: { title: 'Crash Test Entry', content: 'Testing crash resistance' },
      });
      entryCreated = !!entry?.id;
      testEntryId = entry?.id;
    } catch (e: any) {
      errorThrown = true;
    } finally {
      if (testEntryId) await prisma.entry.delete({ where: { id: testEntryId } });
    }

    const passed = !errorThrown && entryCreated;
    record(
      'Synchronous Fatal Exception in Hook',
      'Crash Isolation (Layer 2)',
      passed,
      Date.now() - t0,
      passed ? 'Hook threw fatal Error, but NodePress caught it and created the entry flawlessly.' : 'Fatal error bubbled and crashed the request.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 2: CRASH ISOLATION — ASYNC PROMISE REJECTION & NULL POINTER
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const rogueId = 'rogue-async-null-crasher';
    registry.register({
      manifest: {
        id: rogueId,
        name: 'Rogue Async Crasher',
        version: '1.0.0',
        description: 'Attempts null pointer access inside async promise',
        permissions: ['entries:write'],
      },
      module: class DummyModule {},
      enabled: true,
      config: {},
    });

    hookBus.on(
      PluginEvents.ENTRY_BEFORE_CREATE,
      async () => {
        const nullObj: any = null;
        return nullObj.deep.nested.property.doesNotExist();
      },
      2,
      rogueId,
      'entries:write',
    );

    let errorThrown = false;
    let entryCreated = false;
    let testEntryId: number | undefined;

    try {
      const entry = await entriesService.create({
        contentTypeId: testType.id,
        slug: `test-async-crash-${Date.now()}`,
        status: 'published',
        data: { title: 'Async Null Crash Test', content: 'Testing null pointer resilience' },
      });
      entryCreated = !!entry?.id;
      testEntryId = entry?.id;
    } catch (e: any) {
      errorThrown = true;
    } finally {
      if (testEntryId) await prisma.entry.delete({ where: { id: testEntryId } });
    }

    const passed = !errorThrown && entryCreated;
    record(
      'Async Null Pointer & Unhandled Rejection',
      'Crash Isolation (Layer 2)',
      passed,
      Date.now() - t0,
      passed ? 'Async TypeError intercepted by error boundary; transaction succeeded.' : 'Async crash brought down the operation.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 3: TIMEOUT DEFENSE — SLOW / HANGING ASYNC PROMISE (LAYER 4)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    let timedOutCaught = false;
    try {
      await (hookBus as any).executeWithTimeout(
        () => new Promise((resolve) => setTimeout(resolve, 5000)), // Hangs 5s
        200, // Hard cap 200ms
        'Test Hung Network Hook',
      );
    } catch (err: any) {
      if (err.message.includes('timed out')) {
        timedOutCaught = true;
      }
    }

    const elapsed = Date.now() - t0;
    const passed = timedOutCaught && elapsed < 1000;
    record(
      'Hanging Async Operation Timeout Guard',
      'Execution Timeout (Layer 4)',
      passed,
      elapsed,
      passed ? `Execution safely aborted after ${elapsed}ms (capped under 1000ms limit).` : 'Hanging promise blocked the event loop.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 4: CAPABILITY PERMISSION ENFORCEMENT (LAYER 1)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const restrictedId = 'unauthorized-stealth-plugin';
    registry.register({
      manifest: {
        id: restrictedId,
        name: 'Unauthorized Stealth Plugin',
        version: '1.0.0',
        description: 'Declares only entries:read but tries to execute entries:delete',
        permissions: ['entries:read'], // Lacks entries:delete
      },
      module: class DummyModule {},
      enabled: true,
      config: {},
    });

    let maliciousActionExecuted = false;
    hookBus.on(
      PluginEvents.ENTRY_BEFORE_DELETE,
      () => {
        maliciousActionExecuted = true;
      },
      5,
      restrictedId,
      'entries:delete', // Requires delete permission
    );

    // Trigger delete event
    await hookBus.emit(PluginEvents.ENTRY_BEFORE_DELETE, { id: 999, slug: 'test' });

    const passed = !maliciousActionExecuted;
    record(
      'Undeclared Permission Scope Violation Block',
      'Capability Permissions (Layer 1)',
      passed,
      Date.now() - t0,
      passed ? 'HookBus detected missing "entries:delete" capability and dropped execution.' : 'Security bypass! Unauthorized hook executed.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 5: CONCURRENT HOOK BUS LOAD (100 PARALLEL DISPATCHES)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const PARALLEL_COUNT = 100;
    console.log(`    ⏳ Spawning ${PARALLEL_COUNT} simultaneous hook bus dispatches...`);

    let processedCount = 0;
    const testEvent = 'stress.concurrent.event';

    hookBus.on(testEvent, async (payload: any) => {
      payload.processed = true;
      payload.timestamp = Date.now();
      processedCount++;
    });

    const items = Array.from({ length: PARALLEL_COUNT }).map((_, i) => ({ id: i, processed: false }));
    await Promise.all(items.map((item) => hookBus.emit(testEvent, item)));

    const duration = Date.now() - t0;
    const allProcessed = items.every((i) => i.processed) && processedCount === PARALLEL_COUNT;
    record(
      `Hook Bus High-Concurrency (${PARALLEL_COUNT} Parallel Invocations)`,
      'Concurrency & Performance',
      allProcessed,
      duration,
      allProcessed ? `Executed ${PARALLEL_COUNT} concurrent hooks in ${duration}ms (${(duration / PARALLEL_COUNT).toFixed(2)}ms per dispatch).` : 'Race condition or dropped dispatches detected.',
      allProcessed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 6: 0-DOWNTIME LIVE TOGGLE UNDER ACTIVE EXECUTION
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    // 1. Toggle OFF
    await pluginService.togglePlugin('seo-analyzer', false, 'stress-tester@nodepress.com');
    const offInRegistry = !registry.isEnabled('seo-analyzer');
    const offInDb = (await prisma.installedPlugin.findUnique({ where: { id: 'seo-analyzer' } }))?.enabled === false;

    // 2. Toggle back ON
    await pluginService.togglePlugin('seo-analyzer', true, 'stress-tester@nodepress.com');
    const onInRegistry = registry.isEnabled('seo-analyzer');
    const onInDb = (await prisma.installedPlugin.findUnique({ where: { id: 'seo-analyzer' } }))?.enabled === true;

    const passed = offInRegistry && offInDb && onInRegistry && onInDb;
    record(
      'Zero-Downtime Live Toggle Memory & DB Sync',
      'Dynamic Toggle (0-Downtime)',
      passed,
      Date.now() - t0,
      passed ? 'Instant state flipping verified in both in-memory registry and PostgreSQL database.' : 'State desynchronization between memory and database.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 7: DYNAMIC CONFIG SCHEMA MUTATION & TYPE COERCION
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const testConfig = {
      wordsPerMinute: 250,
      targetField: 'content',
      customSpecialChars: '<>&"\'🚀 Unicode Test',
    };

    const updated = await pluginService.updatePluginConfig('word-count', testConfig, 'admin@nodepress.com');
    const dbRow = await prisma.installedPlugin.findUnique({ where: { id: 'word-count' } });
    const memoryConfig = registry.getConfig('word-count');

    const passed =
      updated.config.wordsPerMinute === 250 &&
      (dbRow?.config as any)?.wordsPerMinute === 250 &&
      memoryConfig.wordsPerMinute === 250 &&
      memoryConfig.customSpecialChars === '<>&"\'🚀 Unicode Test';

    record(
      'Live Configuration Updates with Complex Types & Unicode',
      'Settings & Configuration Drawer',
      passed,
      Date.now() - t0,
      passed ? 'Configuration persisted to PostgreSQL JSON column and active in-memory cache.' : 'Config failed to persist or lost unicode characters.',
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 8: WATERFALL DATA TRANSFORMATION FILTERS
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const filterName = 'test.data.pipeline';

    // Register 3 sequential pipeline filters with different priorities
    hookBus.addFilter(filterName, (val: string) => val.trim(), 5);
    hookBus.addFilter(filterName, (val: string) => val.toUpperCase(), 10);
    hookBus.addFilter(filterName, (val: string) => `[SANITIZED: ${val}]`, 20);

    const result = await hookBus.applyFilters(filterName, '   hello nodepress plugin system   ');
    const passed = result === '[SANITIZED: HELLO NODEPRESS PLUGIN SYSTEM]';

    record(
      'Waterfall Data Transformation Pipeline Filters',
      'Data Filter Bus',
      passed,
      Date.now() - t0,
      passed ? `Piped correctly through 3 stages: "${result}".` : `Filter output mismatch: "${result}".`,
      passed ? 10 : 0,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCENARIO 9: AUDIT TRAIL RECORDING INTEGRITY
  // ─────────────────────────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    const recentAudit = await prisma.auditLog.findFirst({
      where: { resource: 'plugin' },
      orderBy: { createdAt: 'desc' },
    });

    const passed = !!recentAudit && recentAudit.resource === 'plugin';
    record(
      'Audit Trail Verification for Plugin Actions',
      'Compliance & Audit Logging (Layer 6)',
      passed,
      Date.now() - t0,
      passed ? `Verified audit log entry #${recentAudit?.id} [action="${recentAudit?.action}", user="${recentAudit?.userEmail}"] in PostgreSQL.` : 'No audit trail recorded for plugin mutations.',
      passed ? 10 : 0,
    );
  }

  // Cleanup test content type
  try {
    await prisma.contentType.delete({ where: { id: testType.id } });
  } catch (e) {}

  const totalDuration = Date.now() - startTime;
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  const avgScore = (results.reduce((acc, r) => acc + r.score, 0) / results.length).toFixed(1);

  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(' 🏁 [BRUTAL TEST RUN SUMMARY]');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(` Total Scenarios Tested:  ${results.length}`);
  console.log(` Passed:                  ${totalPassed} / ${results.length} ✅`);
  console.log(` Failed:                  ${totalFailed} ❌`);
  console.log(` Overall Stability Score: ${avgScore} / 10 ⭐`);
  console.log(` Total Test Duration:     ${totalDuration}ms`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  await app.close();
  return { results, avgScore, totalDuration };
}

runBrutalTestSuite().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
