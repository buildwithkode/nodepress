import { AiService } from './ai.service';
import { SchemaValidator } from '../fields/schema.validator';
import { DataValidator } from '../fields/data.validator';
import { env } from '../config/env';

function setup(parsed: any, stop_reason = 'end_turn') {
  const prisma: any = {
    contentType: {
      findMany: jest.fn().mockResolvedValue([{ name: 'author' }]),
      findUnique: jest.fn().mockResolvedValue({
        id: 1, name: 'post', displayName: 'Post',
        schema: [
          { name: 'title', type: 'text', required: true },
          { name: 'rating', type: 'select', options: { choices: ['good', 'bad'] } },
          { name: 'cover', type: 'image' },
        ],
      }),
    },
  };
  const svc = new AiService(prisma, new SchemaValidator(), new DataValidator());
  const parse = jest.fn().mockResolvedValue({ stop_reason, parsed_output: parsed });
  (svc as any).client = { beta: { messages: { parse } } };
  return { svc, parse };
}

const field = (over: any) => ({
  required: false, description: '', choices: [], multiple: false, related_content_type: '', cardinality: 'one',
  sub_fields: [], layouts: [], ...over,
});

describe('AiService', () => {
  const saved = env.ANTHROPIC_API_KEY;
  beforeEach(() => ((env as any).ANTHROPIC_API_KEY = 'sk-test'));
  afterAll(() => ((env as any).ANTHROPIC_API_KEY = saved));

  it('is off without ANTHROPIC_API_KEY', async () => {
    (env as any).ANTHROPIC_API_KEY = undefined;
    const { svc, parse } = setup({});
    expect(svc.status()).toEqual({ enabled: false, model: null });
    await expect(svc.generateContentModel('a blog')).rejects.toThrow(/not configured/);
    expect(parse).not.toHaveBeenCalled();
  });

  it('turns the model output into a valid schema, dropping links to unknown types', async () => {
    const { svc, parse } = setup({
      name: 'recipe', display_name: 'Recipe',
      fields: [
        field({ name: 'title', label: 'Title', type: 'text', required: true }),
        field({ name: 'difficulty', label: 'Difficulty', type: 'select', choices: ['easy', 'hard'] }),
        field({ name: 'author', label: 'Author', type: 'relation', related_content_type: 'author' }),
        field({ name: 'chef', label: 'Chef', type: 'relation', related_content_type: 'chef' }),
        field({ name: 'steps', label: 'Steps', type: 'repeater', sub_fields: [{ name: 'text', label: 'Text', type: 'textarea', required: false, description: '', choices: [], multiple: false }] }),
      ],
    });
    const res = await svc.generateContentModel('recipes with steps');
    expect(res.name).toBe('recipe');
    expect(res.schema.map((f: any) => f.name)).toEqual(['title', 'difficulty', 'author', 'steps']);
    expect(res.schema[1]).toMatchObject({ options: { choices: ['easy', 'hard'] } });
    expect(res.schema[2]).toMatchObject({ options: { relatedContentType: 'author', cardinality: 'one' } });
    const call = parse.mock.calls[0][0];
    expect(call).toMatchObject({ model: env.AI_MODEL, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(call.output_config.format.type).toBe('json_schema');
  });

  it('drafts only the fields it can fill, and validates them', async () => {
    const { svc, parse } = setup({ title: 'Hello', rating: 'good' });
    expect(await svc.draftEntry(1, 'a happy post')).toEqual({ data: { title: 'Hello', rating: 'good' } });
    const schema = parse.mock.calls[0][0].output_config.format.schema;
    expect(Object.keys(schema.properties)).toEqual(['title', 'rating']); // no image
    // The SDK states the choices in the description; DataValidator enforces them.
    expect(schema.properties.rating.description).toMatch(/good.*bad/);
    const bad = setup({ title: 'Hello', rating: 'meh' });
    await expect(bad.svc.draftEntry(1, 'x')).rejects.toThrow(/validation/i);
  });

  it('reports refusals and rejects empty prompts', async () => {
    await expect(setup(null, 'refusal').svc.draftEntry(1, 'x')).rejects.toThrow(/declined/);
    await expect(setup({}).svc.generateContentModel('   ')).rejects.toThrow(/Describe/);
  });
});
