const { test } = require('node:test');
const assert = require('node:assert');
const { onPreviewUpdate, enableClickToEdit, isInPreviewFrame } = require('../dist/cjs/preview.js');

const ADMIN = 'https://cms.test';

/** A window inside a frame: records what it posts to its parent and dispatches events. */
function fakeWindow({ framed = true } = {}) {
  const listeners = { message: new Set() };
  const docListeners = {};
  const posted = [];
  const win = {
    posted,
    addEventListener: (type, fn) => listeners[type].add(fn),
    removeEventListener: (type, fn) => listeners[type].delete(fn),
    dispatchMessage: (event) => [...listeners.message].forEach((fn) => fn(event)),
    listenerCount: () => listeners.message.size,
    document: {
      addEventListener: (type, fn) => ((docListeners[type] ??= new Set()).add(fn)),
      removeEventListener: (type, fn) => docListeners[type]?.delete(fn),
      dispatch: (type, event) => [...(docListeners[type] ?? [])].forEach((fn) => fn(event)),
      count: () => Object.values(docListeners).reduce((n, s) => n + s.size, 0),
    },
  };
  win.parent = framed ? { postMessage: (message, origin) => posted.push({ message, origin }) } : win;
  return win;
}

/** An element with data-np-field, and a child inside it. */
function fakeField(name) {
  const el = {
    style: { outline: '', cursor: '' },
    getAttribute: (attr) => (attr === 'data-np-field' ? name : null),
    closest: () => el,
  };
  const child = { closest: () => el };
  return { el, child };
}

test('onPreviewUpdate sends ready and only accepts messages from the admin origin', () => {
  const win = fakeWindow();
  const updates = [];
  const stop = onPreviewUpdate((u) => updates.push(u), { adminOrigin: `${ADMIN}/`, window: win });

  assert.deepStrictEqual(win.posted, [{ message: { type: 'nodepress:ready' }, origin: ADMIN }]);

  const msg = { type: 'nodepress:preview', contentType: 'blog', slug: 'a', locale: 'en', data: { title: 'Hi' } };
  win.dispatchMessage({ origin: 'https://evil.test', source: win.parent, data: msg });
  win.dispatchMessage({ origin: ADMIN, source: {}, data: msg }); // not from the parent frame
  win.dispatchMessage({ origin: ADMIN, source: win.parent, data: { type: 'other' } });
  win.dispatchMessage({ origin: ADMIN, source: win.parent, data: msg });
  assert.deepStrictEqual(updates, [msg]);

  stop();
  assert.strictEqual(win.listenerCount(), 0);
  win.dispatchMessage({ origin: ADMIN, source: win.parent, data: msg });
  assert.strictEqual(updates.length, 1);
});

test('onPreviewUpdate is a no-op outside a frame and rejects "*"', () => {
  const win = fakeWindow({ framed: false });
  assert.strictEqual(isInPreviewFrame(win), false);
  const stop = onPreviewUpdate(() => {}, { adminOrigin: ADMIN, window: win });
  assert.strictEqual(win.listenerCount(), 0);
  stop();
  assert.throws(() => onPreviewUpdate(() => {}, { adminOrigin: '*', window: fakeWindow() }), /not "\*"/);
  assert.throws(() => onPreviewUpdate(() => {}, { adminOrigin: '', window: fakeWindow() }), /required/);
});

test('enableClickToEdit outlines fields on hover and posts focus-field on click', () => {
  const win = fakeWindow();
  const { el, child } = fakeField('title');
  el.style.outline = 'none';
  const stop = enableClickToEdit({ adminOrigin: ADMIN, window: win });

  win.document.dispatch('mouseover', { target: child });
  assert.match(el.style.outline, /dashed/);
  assert.strictEqual(el.style.cursor, 'pointer');
  // Moving between children of the same field keeps the outline.
  win.document.dispatch('mouseout', { target: child, relatedTarget: el });
  assert.match(el.style.outline, /dashed/);
  win.document.dispatch('mouseout', { target: child, relatedTarget: null });
  assert.strictEqual(el.style.outline, 'none');

  let prevented = false;
  win.document.dispatch('click', { target: child, preventDefault: () => (prevented = true), stopPropagation() {} });
  assert.ok(prevented);
  assert.deepStrictEqual(win.posted, [{ message: { type: 'nodepress:focus-field', field: 'title' }, origin: ADMIN }]);

  // Clicks elsewhere are left alone.
  win.document.dispatch('click', { target: { closest: () => null } });
  assert.strictEqual(win.posted.length, 1);

  win.document.dispatch('mouseover', { target: child });
  stop();
  assert.strictEqual(el.style.outline, 'none', 'outline restored on cleanup');
  assert.strictEqual(win.document.count(), 0);
});

test('enableClickToEdit does nothing outside a frame', () => {
  const win = fakeWindow({ framed: false });
  enableClickToEdit({ adminOrigin: ADMIN, window: win });
  assert.strictEqual(win.document.count(), 0);
});

test('preview helpers are exported from the index and the ESM subpath', async () => {
  const index = require('../dist/cjs/index.js');
  assert.strictEqual(typeof index.onPreviewUpdate, 'function');
  const esm = await import('../dist/esm/preview.js');
  assert.strictEqual(typeof esm.enableClickToEdit, 'function');
});
