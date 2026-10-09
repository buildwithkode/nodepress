import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ContentTypeService } from '../src/content-type/content-type.service';
import { EntriesService } from '../src/entries/entries.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreateContentTypeDto } from '../src/content-type/dto/create-content-type.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function testLinkFieldFlow() {
  console.log('🚀 [Link Field Flow Test] Starting...');

  // 1. Test DTO Validation Pipe logic
  console.log('--- Step 1: Testing class-validator DTO validation ---');
  const dtoData = {
    name: 'test_link_ct',
    displayName: 'Test Link Content Type',
    schema: [
      { name: 'title', type: 'text', required: true },
      { name: 'primary_button', type: 'link', required: true },
      {
        name: 'header_nav',
        type: 'repeater',
        options: {
          subFields: [
            { name: 'label', type: 'text' },
            { name: 'nav_link', type: 'link' },
          ],
        },
      },
      {
        name: 'footer',
        type: 'group',
        options: {
          subFields: [
            { name: 'copyright', type: 'text' },
            { name: 'privacy_link', type: 'link' },
          ],
        },
      },
    ],
  };

  const dtoInstance = plainToInstance(CreateContentTypeDto, dtoData);
  const dtoErrors = await validate(dtoInstance);
  if (dtoErrors.length > 0) {
    console.error('❌ DTO validation failed:', JSON.stringify(dtoErrors, null, 2));
    throw new Error('DTO validation failed for link field');
  }
  console.log('✅ DTO Validation passed cleanly with 0 errors.');

  // 2. Boot Application Context to test against DB
  console.log('\n--- Step 2: Booting NestJS Application Context ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const contentTypeService = app.get(ContentTypeService);
  const entriesService = app.get(EntriesService);
  const prisma = app.get(PrismaService);

  const ctName = `link_test_${Date.now()}`;

  try {
    console.log(`\n--- Step 3: Creating Content Type with link field: "${ctName}" ---`);
    const createdCt = await contentTypeService.create({
      name: ctName,
      displayName: 'Link Flow Test',
      schema: [
        { name: 'title', type: 'text', required: true },
        { name: 'website_link', type: 'link', required: true },
        {
          name: 'social_links',
          type: 'repeater',
          options: {
            subFields: [
              { name: 'platform', type: 'text' },
              { name: 'profile_link', type: 'link' },
            ],
          },
        },
      ],
    });
    console.log(`✅ Content Type created successfully! ID: ${createdCt.id}, Name: ${createdCt.name}`);

    console.log('\n--- Step 4: Creating Entry with structured link value ---');
    const entryData = {
      title: 'Testing Link Field Support',
      website_link: {
        url: 'https://nodepress.buildwithkode.com',
        text: 'NodePress Official Site',
        newTab: true,
      },
      social_links: [
        {
          platform: 'GitHub',
          profile_link: {
            url: 'https://github.com/buildwithkode/nodepress',
            text: 'NodePress Repo',
            newTab: true,
          },
        },
      ],
    };

    const entry = await entriesService.create({
      contentTypeId: createdCt.id,
      slug: `link-entry-${Date.now()}`,
      status: 'published',
      data: entryData,
    });
    console.log(`✅ Entry created successfully! ID: ${entry.id}, Slug: ${entry.slug}`);
    console.log('Saved entry link data:', JSON.stringify(entry.data, null, 2));

    console.log('\n--- Step 5: Verifying Entry Retrieval & Link Shape ---');
    const fetched = await entriesService.findOne(entry.id);
    if (!fetched) throw new Error('Could not find created entry');

    const fetchedLink = (fetched.data as any).website_link;
    if (
      fetchedLink?.url !== 'https://nodepress.buildwithkode.com' ||
      fetchedLink?.text !== 'NodePress Official Site' ||
      (fetchedLink?.newTab !== true && fetchedLink?.newtab !== true)
    ) {
      throw new Error(`Link data mismatch: ${JSON.stringify(fetchedLink)}`);
    }
    console.log('✅ Stored and fetched link value matched perfectly!');

    console.log('\n--- Step 6: Testing validation rejection on invalid URL ---');
    let rejected = false;
    try {
      await entriesService.create({
        contentTypeId: createdCt.id,
        slug: `invalid-link-${Date.now()}`,
        status: 'published',
        data: {
          title: 'Invalid',
          website_link: { url: '' },
        },
      });
    } catch (e: any) {
      rejected = true;
      console.log('✅ Invalid URL was properly rejected by DataValidator:', e.message);
    }
    if (!rejected) throw new Error('Expected invalid URL to be rejected');

    console.log('\n--- Step 7: Cleaning up test artifacts ---');
    await contentTypeService.remove(createdCt.id);
    console.log('✅ Test content type removed.');

    console.log('\n🎉 ALL LINK FIELD FLOW TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    await app.close();
  }
}

testLinkFieldFlow().catch((err) => {
  console.error('❌ Flow test failed:', err);
  process.exit(1);
});
