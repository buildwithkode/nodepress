import { inflateRawSync, deflateRawSync } from 'zlib';
import { posix } from 'path';

/**
 * Minimal zip reader/writer for plugin packages (no dependency). Supports the
 * stored and deflate methods without zip64 — what every zip tool writes for an
 * archive under 4 GB. Reading is defensive: it refuses encrypted entries, paths
 * that escape the archive, and archives that unpack past the given limits.
 */

export interface ZipLimits {
  maxFiles: number;
  maxUnpackedBytes: number;
}

export class ZipError extends Error {}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** A safe relative path inside the archive, or null for one that isn't. */
export function safeEntryPath(name: string): string | null {
  if (!name || name.includes('\\') || name.includes('\0')) return null;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return null;
  const normalized = posix.normalize(name);
  if (normalized.startsWith('../') || normalized === '..' || normalized.split('/').includes('..')) return null;
  return normalized;
}

/** Unpack a zip into path → contents. Directories are dropped. */
export function readZip(buf: Buffer, limits: ZipLimits): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('Not a zip file');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new ZipError('Zip64 archives are not supported');
  if (count > limits.maxFiles) throw new ZipError(`Too many files in the archive (max ${limits.maxFiles})`);

  const files = new Map<string, Buffer>();
  let unpacked = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new ZipError('Corrupt zip central directory');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue; // directory
    if (rawName.startsWith('__MACOSX/') || posix.basename(rawName) === '.DS_Store') continue;
    if (flags & 1) throw new ZipError(`Encrypted entries are not supported (${rawName})`);
    const name = safeEntryPath(rawName);
    if (!name) throw new ZipError(`Unsafe path in archive: ${rawName}`);
    if (files.has(name)) throw new ZipError(`Duplicate path in archive: ${name}`);

    unpacked += size;
    if (unpacked > limits.maxUnpackedBytes) {
      throw new ZipError(`Archive unpacks to more than ${Math.round(limits.maxUnpackedBytes / 1024 / 1024)} MB`);
    }

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== LOCAL) throw new ZipError(`Corrupt zip entry: ${name}`);
    const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    if (start + compSize > buf.length) throw new ZipError(`Truncated zip entry: ${name}`);
    const data = buf.subarray(start, start + compSize);

    let contents: Buffer;
    if (method === 0) contents = Buffer.from(data);
    else if (method === 8) {
      try {
        // maxOutputLength stops a lying header from inflating without bound.
        contents = inflateRawSync(data, { maxOutputLength: Math.max(size, 1) });
      } catch {
        throw new ZipError(`Could not decompress ${name}`);
      }
    } else throw new ZipError(`Unsupported compression method ${method} (${name})`);
    if (contents.length !== size) throw new ZipError(`Size mismatch for ${name}`);
    files.set(name, contents);
  }
  return files;
}

/**
 * When every file sits under one top folder (how "Compress folder" zips look)
 * and the package manifest isn't at the root, drop that folder.
 */
export function stripTopFolder(files: Map<string, Buffer>, marker: string): Map<string, Buffer> {
  if (files.has(marker)) return files;
  const tops = new Set([...files.keys()].map((k) => k.split('/')[0]));
  if (tops.size !== 1) return files;
  const [top] = tops;
  if (!files.has(`${top}/${marker}`)) return files;
  return new Map([...files].map(([k, v]) => [k.slice(top.length + 1), v]));
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Write path → contents as a deflate zip (used by tests; the CLI has its own copy). */
export function writeZip(files: Map<string, Buffer> | Record<string, Buffer | string>): Buffer {
  const entries = files instanceof Map ? [...files] : Object.entries(files);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, value] of entries) {
    const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, deflated);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(deflated.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += 30 + nameBuf.length + deflated.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
