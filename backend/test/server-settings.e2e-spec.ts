import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as net from 'net';
import { AddressInfo } from 'net';
import { createTestApp, cleanDatabase, registerAdmin } from './helpers';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';

/** Enough SMTP for nodemailer's verify() and one message per connection. */
function fakeSmtp() {
  const messages: Array<{ auth: string | null; data: string }> = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let data = '';
    let auth: string | null = null;
    socket.write('220 fake ESMTP\r\n');
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      let i;
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push({ auth, data });
            data = '';
            socket.write('250 queued\r\n');
          } else data += `${line}\n`;
          continue;
        }
        const cmd = line.split(' ')[0].toUpperCase();
        if (cmd === 'EHLO' || cmd === 'HELO') socket.write('250-fake\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (cmd === 'AUTH') {
          auth = Buffer.from(line.split(' ')[2] ?? '', 'base64').toString().split('\0').slice(1).join(':');
          socket.write(auth === 'mailer:right' ? '235 ok\r\n' : '535 bad credentials\r\n');
        } else if (cmd === 'DATA') { inData = true; socket.write('354 go\r\n'); }
        else if (cmd === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
        else socket.write('250 ok\r\n');
      }
    });
  });
  return { server, messages };
}

describe('Server settings: email and storage (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let port: number;
  const smtp = fakeSmtp();
  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await new Promise<void>((r) => smtp.server.listen(0, '127.0.0.1', r));
    port = (smtp.server.address() as AddressInfo).port;
    app = await createTestApp();
    await cleanDatabase(app);
    await app.get(PrismaService).setting.updateMany({ data: { mail: null as any, storage: null as any } });
    token = await registerAdmin(app);
  });

  afterAll(async () => {
    await app.get(PrismaService).setting.updateMany({ data: { mail: null as any, storage: null as any } });
    await cleanDatabase(app);
    await app.close();
    smtp.server.close();
  });

  it('starts unconfigured, and is admin-only', async () => {
    const res = await http().get('/api/server-settings').set(auth()).expect(200);
    expect(res.body.mail).toMatchObject({ source: null, enabled: false });
    expect(res.body.storage).toMatchObject({ driver: 'local', active: 'local', restartRequired: false });
    await http().get('/api/server-settings').expect(401);
  });

  it('tests unsaved SMTP settings, then saves them with the password encrypted', async () => {
    const settings = { enabled: true, host: '127.0.0.1', port, secure: false, user: 'mailer', from: 'Site <site@example.com>' };
    const bad = await http().post('/api/server-settings/mail/test').set(auth()).send({ ...settings, pass: 'wrong', to: 'me@example.com' }).expect(400);
    expect(bad.body.message).toMatch(/Email test failed/);
    await http().post('/api/server-settings/mail/test').set(auth()).send({ ...settings, pass: 'right', to: 'me@example.com' }).expect(200);
    expect(smtp.messages.pop()!.data).toMatch(/test email/);

    const saved = await http().put('/api/server-settings/mail').set(auth()).send({ ...settings, pass: 'right' }).expect(200);
    expect(saved.body.mail).toMatchObject({ source: 'database', enabled: true, host: '127.0.0.1', hasPassword: true });
    expect(JSON.stringify(saved.body)).not.toContain('right'); // never returned
    const row = await app.get(PrismaService).setting.findUnique({ where: { id: 1 } });
    expect((row!.mail as any).pass).toMatch(/^enc:v1:/);

    // Applies at once: the running mailer sends with it (and keeps the password when it's left blank).
    expect(app.get(MailService).isConfigured).toBe(true);
    await http().put('/api/server-settings/mail').set(auth()).send({ ...settings, pass: '' }).expect(200);
    await http().post('/api/server-settings/mail/test').set(auth()).send({ to: 'me@example.com' }).expect(200);
    expect(smtp.messages.pop()).toMatchObject({ auth: 'mailer:right' });

    await http().put('/api/server-settings/mail').set(auth()).send({ enabled: false }).expect(200);
    expect(app.get(MailService).isConfigured).toBe(false);
  });

  it('storage: saving S3 needs a restart; failing credentials are reported', async () => {
    const s3 = { driver: 's3', bucket: 'site-media', region: 'auto', accessKey: 'AKIA', secretKey: 'sekret', endpoint: 'http://127.0.0.1:1' };
    const test = await http().post('/api/server-settings/storage/test').set(auth()).send(s3).expect(400);
    expect(test.body.message).toMatch(/Storage test failed/);
    const saved = await http().put('/api/server-settings/storage').set(auth()).send(s3).expect(200);
    expect(saved.body.storage).toMatchObject({ source: 'database', driver: 's3', bucket: 'site-media', hasSecret: true, active: 'local', restartRequired: true });
    await http().put('/api/server-settings/storage').set(auth()).send({ driver: 's3', bucket: 'x' }).expect(400); // accessKey required
    const back = await http().put('/api/server-settings/storage').set(auth()).send({ driver: 'local' }).expect(200);
    expect(back.body.storage).toMatchObject({ driver: 'local', restartRequired: false });
  });
});
