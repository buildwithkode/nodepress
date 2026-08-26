import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PluginService } from '../src/plugin/plugin.service';
import { PluginRegistry } from '../src/plugin/plugin.registry';
import { PluginHookBus } from '../src/plugin/plugin-hook-bus';
import { EntriesService } from '../src/entries/entries.service';
import { ContentTypeService } from '../src/content-type/content-type.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function runPluginE2ETest() {
  console.log('🚀 [E2E Test] Initializing NestJS App Context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const pluginService = app.get(PluginService);
  const pluginRegistry = app.get(PluginRegistry);
  const prisma = app.get(PrismaService);
  const entriesService = app.get(EntriesService);
  const contentTypeService = app.get(ContentTypeService);

  console.log('\n--- 1. Testing Plugin Listing & Discovery ---');
  const listResult = pluginService.listPlugins();
  console.log(`✅ Total Plugins Registered: ${listResult.meta.totalPlugins}`);
  console.log(`✅ Active Plugins: ${listResult.meta.enabledPlugins}`);
  console.log(`✅ Active Hooks: ${listResult.meta.totalHooks}, Active Filters: ${listResult.meta.totalFilters}`);
  console.log('Plugins found:', listResult.plugins.map((p: any) => `${p.name} (v${p.version}) [enabled=${p.enabled}]`));

  if (!listResult.plugins.find((p: any) => p.id === 'word-count') || !listResult.plugins.find((p: any) => p.id === 'seo-analyzer')) {
    throw new Error('Expected word-count and seo-analyzer plugins in listResult');
  }

  console.log('\n--- 2. Testing Plugin Live Configuration Update ---');
  console.log('Initial word-count config:', pluginRegistry.getConfig('word-count'));
  const updatedConfigRes = await pluginService.updatePluginConfig('word-count', {
    wordsPerMinute: 100,
    targetField: 'content',
  }, 'test-admin@nodepress.com');
  console.log('✅ Updated word-count config via PluginService:', updatedConfigRes.config);
  if (pluginRegistry.getConfig('word-count').wordsPerMinute !== 100) {
    throw new Error('Config update was not applied live in PluginRegistry');
  }

  console.log('\n--- 3. Testing Plugin Interception on Entry Lifecycle Hooks ---');
  // Find or create test content type
  let testType = await prisma.contentType.findUnique({ where: { name: 'article' } });
  if (!testType) {
    testType = await contentTypeService.create({
      name: 'article',
      displayName: 'Article',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'content', type: 'richtext', required: false },
      ],
    });
  }

  const testSlug = `plugin-test-${Date.now()}`;
  const sampleText = 'NodePress is a modern enterprise-grade headless CMS written with NestJS and Next.js. Plugins allow custom extensions.';
  
  console.log(`Creating test entry with slug: ${testSlug}`);
  const createdEntry = await entriesService.create({
    contentTypeId: testType.id,
    slug: testSlug,
    status: 'published',
    data: {
      title: 'Guide to NodePress Plugins & Security Architecture',
      content: sampleText,
    },
  });

  const entryData = createdEntry.data as Record<string, any>;
  console.log('Created entry payload data:', entryData);

  const wordCount = entryData._wordcount ?? entryData._wordCount;
  const readingTime = entryData._readingtimeminutes ?? entryData._readingTimeMinutes;
  const seoScore = entryData._seoscore ?? entryData._seoScore;
  const seoSuggestions = entryData._seosuggestions ?? entryData._seoSuggestions;

  console.log(`✅ Word Count Plugin Result -> words: ${wordCount}, reading time: ${readingTime} min`);
  console.log(`✅ SEO Analyzer Plugin Result -> score: ${seoScore}/100, suggestions:`, seoSuggestions);

  if (typeof wordCount !== 'number' || wordCount <= 0) {
    throw new Error('Word count plugin did not calculate _wordCount');
  }
  if (typeof seoScore !== 'number') {
    throw new Error('SEO Analyzer plugin did not calculate _seoScore');
  }

  console.log('\n--- 4. Testing 0-Downtime Live Toggle (Disable SEO Analyzer) ---');
  await pluginService.togglePlugin('seo-analyzer', false, 'test-admin@nodepress.com');
  console.log('✅ Disabled seo-analyzer. Registry isEnabled:', pluginRegistry.isEnabled('seo-analyzer'));
  if (pluginRegistry.isEnabled('seo-analyzer')) {
    throw new Error('seo-analyzer should be disabled in registry');
  }

  // Update entry while SEO analyzer is disabled
  const updatedEntry = await entriesService.update(createdEntry.id, {
    data: {
      title: 'Short',
      content: 'Short content only.',
    },
  });

  const updatedData = updatedEntry.data as Record<string, any>;
  console.log('Updated entry with seo-analyzer disabled:', updatedData);
  console.log(`Word Count updated -> words: ${updatedData._wordCount}`);

  console.log('\n--- 5. Re-enabling SEO Analyzer ---');
  await pluginService.togglePlugin('seo-analyzer', true, 'test-admin@nodepress.com');
  console.log('✅ Re-enabled seo-analyzer. Registry isEnabled:', pluginRegistry.isEnabled('seo-analyzer'));

  // Clean up test entry
  await prisma.entry.delete({ where: { id: createdEntry.id } });
  console.log(`Cleaned up test entry #${createdEntry.id}`);

  console.log('\n🎉 ALL PLUGIN SYSTEM E2E TESTS PASSED SUCCESSFULLY!');
  await app.close();
}

runPluginE2ETest().catch((err) => {
  console.error('❌ Plugin E2E Test Failed:', err);
  process.exit(1);
});
