/**
 * PHP's serialize() format, as WordPress stores arrays in post meta (ACF
 * layouts, links, galleries, multi-selects…). Read-only and data-only: objects
 * become plain property maps, nothing is ever instantiated or executed.
 *
 *   a:2:{i:0;s:5:"hello";s:3:"key";b:1;}  →  ["hello"] / { "0": "hello", key: true }
 *
 * String lengths are byte counts (UTF-8). Exports that went through a naive
 * search-and-replace (a changed domain) have wrong lengths; `unserializePhp`
 * then retries leniently, ending each string at the `";` that closes it.
 */

export class PhpParseError extends Error {}

/** Values a serialized PHP string can hold. Arrays become JS arrays when their keys are 0…n-1. */
export type PhpValue = string | number | boolean | null | PhpValue[] | { [key: string]: PhpValue };

const MAX_DEPTH = 64;

/** Does this look like a serialized PHP value (and not ordinary text)? */
export function isSerializedPhp(value: string): boolean {
  const v = value.trim();
  return /^(a:\d+:\{|O:\d+:"|s:\d+:"|i:-?\d+;$|d:[^;]+;$|b:[01];$|N;$)/.test(v);
}

/** Parse a serialized PHP value; undefined when it isn't one (or is too broken to read). */
export function unserializePhp(value: string): PhpValue | undefined {
  if (!isSerializedPhp(value)) return undefined;
  const bytes = Buffer.from(value.trim(), 'utf8');
  for (const lenient of [false, true]) {
    try {
      const p = new Parser(bytes, lenient);
      const out = p.value(0);
      if (p.pos === bytes.length) return out;
    } catch (err) {
      if (!(err instanceof PhpParseError)) throw err;
    }
  }
  return undefined;
}

class Parser {
  pos = 0;
  constructor(private readonly b: Buffer, private readonly lenient: boolean) {}

  private fail(msg: string): never {
    throw new PhpParseError(`${msg} at byte ${this.pos}`);
  }

  private expect(ch: string) {
    if (this.b[this.pos] !== ch.charCodeAt(0)) this.fail(`expected "${ch}"`);
    this.pos++;
  }

  /** Bytes up to (not including) `stop`; moves past it. */
  private until(stop: string): string {
    const end = this.b.indexOf(stop, this.pos, 'latin1');
    if (end < 0) this.fail(`missing "${stop}"`);
    const s = this.b.toString('latin1', this.pos, end);
    this.pos = end + stop.length;
    return s;
  }

  private int(stop: string): number {
    const s = this.until(stop);
    if (!/^-?\d+$/.test(s)) this.fail(`bad integer "${s}"`);
    return parseInt(s, 10);
  }

  private string(): string {
    const len = this.int(':');
    this.expect('"');
    let end = this.pos + len;
    if (this.b[end] !== 0x22 || this.b[end + 1] !== 0x3b) {
      if (!this.lenient) this.fail('string length does not match');
      // The string ends at the `";` that is followed by the next token or the end.
      end = this.findStringEnd();
    }
    const s = this.b.toString('utf8', this.pos, end);
    this.pos = end;
    this.expect('"');
    return s;
  }

  /** Lenient mode: the first `";` followed by what may come next — a key/value, `}` or the end. */
  private findStringEnd(): number {
    let i = this.pos;
    for (;;) {
      const q = this.b.indexOf('";', i, 'latin1');
      if (q < 0) this.fail('unterminated string');
      const next = this.b[q + 2];
      if (next === undefined || next === 0x7d /* } */ || /[asidbNO]/.test(String.fromCharCode(next))) return q;
      i = q + 1;
    }
  }

  value(depth: number): PhpValue {
    if (depth > MAX_DEPTH) this.fail('nested too deeply');
    const type = String.fromCharCode(this.b[this.pos]);
    this.pos++;
    if (type === 'N') { this.expect(';'); return null; }
    this.expect(':');
    switch (type) {
      case 's': { const s = this.string(); this.expect(';'); return s; }
      case 'i': return this.int(';');
      case 'd': {
        const s = this.until(';');
        const n = Number(s);
        return Number.isFinite(n) ? n : s; // INF / NAN stay as text
      }
      case 'b': {
        const s = this.until(';');
        if (s !== '0' && s !== '1') this.fail(`bad boolean "${s}"`);
        return s === '1';
      }
      case 'a': return this.array(depth);
      case 'O': {
        // O:3:"Foo":2:{…} — the class name is ignored, only the properties are kept.
        const len = this.int(':');
        this.expect('"');
        this.pos += len;
        this.expect('"');
        this.expect(':');
        return this.array(depth);
      }
      default: return this.fail(`unsupported type "${type}"`);
    }
  }

  private array(depth: number): PhpValue {
    const count = this.int(':');
    this.expect('{');
    const entries: [string, PhpValue][] = [];
    for (let i = 0; i < count; i++) {
      const key = this.value(depth + 1);
      if (typeof key !== 'string' && typeof key !== 'number') this.fail('bad array key');
      // Object properties: "\0Class\0private" / "\0*\0protected" → the bare name.
      const name = String(key).replace(/^\0[^\0]*\0/, '');
      entries.push([name, this.value(depth + 1)]);
    }
    this.expect('}');
    if (entries.every(([k], i) => k === String(i))) return entries.map(([, v]) => v);
    const obj: { [key: string]: PhpValue } = {};
    for (const [k, v] of entries) obj[k] = v;
    return obj;
  }
}
