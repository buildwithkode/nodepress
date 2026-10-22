import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { AddressInfo } from 'net';
import * as path from 'path';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';

/** The CLI's MCP server (cli/src/mcp.js), spoken to over stdio like an AI client would. */
describe('MCP server (e2e)', () => {
  let app: INestApplication;
  let proc: ChildProcessWithoutNullStreams;
  let nextId = 1;
  const pending = new Map<number, (msg: any) => void>();

  const rpc = (method: string, params?: any) =>
    new Promise<any>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  const tool = async (name: string, args: any = {}) => {
    const res = await rpc('tools/call', { name, arguments: args });
    const text = res.result.content[0].text;
    return { isError: !!res.result.isError, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await cleanDatabase(app);
    const token = await registerAdmin(app);
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer()).post('/api/content-types').set(auth)
      .send({ name: 'note', schema: [{ name: 'title', type: 'text', required: true }] }).expect(201);
    const key = await request(app.getHttpServer()).post('/api/api-keys').set(auth)
      .send({ name: 'mcp', permissions: { access: 'all', contentTypes: ['*'] } }).expect(201);

    proc = spawn(process.execPath, [path.join(__dirname, '../../cli/bin/nodepress.js'), 'mcp'], {
      env: { ...process.env, NODEPRESS_URL: `http://127.0.0.1:${port}`, NODEPRESS_API_KEY: key.body.key },
    });
    let buf = '';
    proc.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) !== -1) {
        const msg = JSON.parse(buf.slice(0, i));
        buf = buf.slice(i + 1);
        pending.get(msg.id)?.(msg);
      }
    });
  });

  afterAll(async () => {
    proc?.kill();
    await cleanDatabase(app);
    await app.close();
  });

  it('initializes and lists its tools', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
    expect(init.result.serverInfo.name).toBe('nodepress');
    expect(init.result.capabilities.tools).toBeDefined();
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const tools = await rpc('tools/list');
    expect(tools.result.tools.map((t: any) => t.name)).toEqual(
      ['list_content_types', 'list_entries', 'get_entry', 'create_entry', 'update_entry', 'graphql'],
    );
    expect((await rpc('nope/method')).error.code).toBe(-32601);
  });

  it('reads the schema, drafts an entry, and only published content is readable', async () => {
    const types = await tool('list_content_types');
    expect(types.json).toEqual([{ name: 'note', allowedMethods: null, fields: [{ name: 'title', type: 'text', required: true }] }]);

    const created = await tool('create_entry', { type: 'note', slug: 'from-ai', data: { title: 'Drafted by AI' } });
    expect(created.isError).toBe(false);
    expect((await tool('get_entry', { type: 'note', slug: 'from-ai' })).isError).toBe(true); // a draft isn't public

    await tool('create_entry', { type: 'note', slug: 'live', data: { title: 'Live' }, status: 'published' });
    const list = await tool('list_entries', { type: 'note', where: { title: { contains: 'Li' } } });
    expect(list.json.data.map((e: any) => e.slug)).toEqual(['live']);
    const gql = await tool('graphql', { query: '{ notes { data { slug } } }' });
    expect(gql.json.notes.data).toEqual([{ slug: 'live' }]);

    const invalid = await tool('create_entry', { type: 'note', slug: 'bad', data: {} });
    expect(invalid.isError).toBe(true);
    expect(invalid.text).toMatch(/title: required/);
  });
});
