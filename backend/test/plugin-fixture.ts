import { generateKeyPairSync, KeyObject } from 'crypto';
import { writeZip } from '../src/plugin/plugin-archive';
import { MANIFEST_FILE, SIGNATURE_FILE, signFiles } from '../src/plugin/plugin-package';

/** An Ed25519 publisher key: `pub` is what goes in PLUGIN_TRUSTED_KEYS. */
export function makeKey(): { privateKey: KeyObject; pub: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { privateKey, pub: (publicKey.export({ format: 'jwk' }) as { x: string }).x };
}

export interface FixtureOptions {
  id?: string;
  version?: string;
  permissions?: string[];
  nodepress?: string;
  signWith?: KeyObject;
  /** Throw from onModuleInit (breaks startup). */
  crash?: boolean;
  /** Overrides for the manifest the code exports (to test a mismatch). */
  codeManifest?: Record<string, any>;
  /** Wrap everything in a top folder, as "Compress folder" does. */
  topFolder?: string;
  extraFiles?: Record<string, string>;
}

/**
 * A real uploadable plugin, in plain JavaScript (decorators applied by hand):
 * a service that stamps `_hello` on new entries and a controller at
 * GET /api/plug-<id>, declared in a sub-module so route gating must follow it.
 */
export function pluginEntry(id: string, opts: FixtureOptions = {}) {
  return `'use strict';
const { Module, Injectable, Inject, Controller, Get } = require('@nestjs/common');
const { PluginContextModule, PLUGIN_CONTEXT, PluginEvents } = require('@nodepress/plugin-sdk');
const json = require('../${MANIFEST_FILE}');
const manifest = Object.assign({}, json, ${JSON.stringify(opts.codeManifest ?? {})});

class HelloService {
  constructor(ctx) { this.ctx = ctx; }
  onModuleInit() {
    ${opts.crash ? `throw new Error('boom from ${id}');` : ''}
    this.ctx.on(PluginEvents.ENTRY_BEFORE_CREATE, (p) => {
      if (p && p.data) p.data._hello = this.ctx.config().greeting;
    });
  }
}
Injectable()(HelloService);
Inject(PLUGIN_CONTEXT)(HelloService, undefined, 0);

class HelloController {
  hi() { return { hello: '${id}' }; }
}
Get()(HelloController.prototype, 'hi', Object.getOwnPropertyDescriptor(HelloController.prototype, 'hi'));
Controller('plug-${id}')(HelloController);

class HelloRoutesModule {}
Module({ controllers: [HelloController] })(HelloRoutesModule);

class HelloModule {}
Module({ imports: [PluginContextModule.forPlugin(manifest), HelloRoutesModule], providers: [HelloService] })(HelloModule);

module.exports = { manifest, module: HelloModule };
`;
}

export function pluginFiles(opts: FixtureOptions = {}): Map<string, Buffer> {
  const id = opts.id ?? 'hello';
  const manifest = {
    id,
    name: `Hello ${id}`,
    version: opts.version ?? '1.0.0',
    description: 'Test plugin',
    author: 'Tests',
    permissions: opts.permissions ?? ['entries:read', 'entries:write'],
    nodepress: opts.nodepress ?? '>=1.0.0',
    main: 'dist/index.js',
    defaultConfig: { greeting: 'hello' },
  };
  const files = new Map<string, Buffer>([
    [MANIFEST_FILE, Buffer.from(JSON.stringify(manifest, null, 2))],
    ['dist/index.js', Buffer.from(pluginEntry(id, opts))],
    ...Object.entries(opts.extraFiles ?? {}).map(([k, v]) => [k, Buffer.from(v)] as [string, Buffer]),
  ]);
  if (opts.signWith) files.set(SIGNATURE_FILE, signFiles(files, opts.signWith));
  return files;
}

export function pluginZip(opts: FixtureOptions = {}): Buffer {
  const files = pluginFiles(opts);
  if (!opts.topFolder) return writeZip(files);
  return writeZip(new Map([...files].map(([k, v]) => [`${opts.topFolder}/${k}`, v])));
}
