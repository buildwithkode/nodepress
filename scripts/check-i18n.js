#!/usr/bin/env node
/**
 * Checks the admin interface translations (frontend/messages/<locale>/*.json):
 *   1. every language has exactly the English keys (no missing, no stale ones)
 *   2. each translation uses the same {placeholders} as the English text
 *   3. every t('key') in the admin code exists in English — for
 *      `const t = useTranslations('ns')` followed by t('literal.key') calls
 *      (template-literal keys can't be checked statically and are skipped)
 *
 * Run: node scripts/check-i18n.js
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const MESSAGES = path.join(FRONTEND, 'messages');
const problems = [];

const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
};
const load = (locale) => {
  const dir = path.join(MESSAGES, locale);
  const all = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    try {
      Object.assign(all, flatten(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), ns));
    } catch (e) {
      problems.push(`${locale}/${file}: invalid JSON — ${e.message}`);
    }
  }
  return all;
};
// Top-level ICU argument names only ({count, plural, …} → count).
const placeholders = (text) => {
  const names = new Set();
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) names.add((text.slice(i + 1).match(/^\s*(\w+)/) || [])[1]);
      depth++;
    } else if (text[i] === '}') depth--;
  }
  names.delete(undefined);
  return [...names].sort().join(',');
};

const locales = fs.readdirSync(MESSAGES).filter((d) => fs.statSync(path.join(MESSAGES, d)).isDirectory());
const en = load('en');

// 4. every message parses as ICU (use-intl's parser): a stray `<`, `{` or `}`
//    makes a message fail at runtime and show its key instead. Write a literal
//    `<` as '<' and braces as '{' '}'.
let parseIcu = null;
try {
  ({ parse: parseIcu } = require(require.resolve('@formatjs/icu-messageformat-parser', { paths: [FRONTEND, path.join(__dirname, '..')] })));
} catch {
  console.warn('[i18n] @formatjs/icu-messageformat-parser not installed — skipping the ICU syntax check');
}
if (parseIcu) {
  for (const locale of locales) {
    for (const [key, text] of Object.entries(locale === 'en' ? en : load(locale))) {
      try {
        parseIcu(text);
      } catch (e) {
        problems.push(`${locale}: ${key} is not valid ICU (${e.message})`);
      }
    }
  }
}
for (const locale of locales.filter((l) => l !== 'en')) {
  const other = load(locale);
  for (const key of Object.keys(en)) {
    if (!(key in other)) problems.push(`${locale}: missing ${key}`);
    else if (placeholders(en[key]) !== placeholders(other[key])) {
      problems.push(`${locale}: ${key} uses {${placeholders(other[key])}}, English uses {${placeholders(en[key])}}`);
    }
  }
  for (const key of Object.keys(other)) if (!(key in en)) problems.push(`${locale}: ${key} is not in English`);
}

const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(p);
  }
  return out;
};
const nsKeys = new Set(Object.keys(en));
const namespaces = new Set(Object.keys(en).map((k) => k.split('.')[0]));
for (const file of [...walk(path.join(FRONTEND, 'app')), ...walk(path.join(FRONTEND, 'components'))]) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(FRONTEND, file);
  for (const m of src.matchAll(/const (\w+) = useTranslations\(\s*'([\w.]+)'\s*\)/g)) {
    const [, fn, ns] = m;
    if (!namespaces.has(ns.split('.')[0])) problems.push(`${rel}: unknown namespace '${ns}'`);
    const call = new RegExp(`\\b${fn}(?:\\.rich|\\.markup)?\\(\\s*'([^']+)'`, 'g');
    for (const c of src.matchAll(call)) {
      const key = `${ns}.${c[1]}`;
      const isBranch = [...nsKeys].some((k) => k.startsWith(`${key}.`));
      if (!nsKeys.has(key) && !isBranch) problems.push(`${rel}: ${fn}('${c[1]}') — no English message ${key}`);
    }
  }
}

if (problems.length) {
  console.error(`[i18n] ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`[i18n] OK — ${Object.keys(en).length} messages × ${locales.length} languages`);
