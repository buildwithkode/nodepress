// Copyright (c) 2026-present BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

/**
 * The folder an install keeps for itself: `.env`, `uploads/` and `.plugins/`.
 * Shared by server.js and scripts/backup.js.
 *
 *   1. NODEPRESS_DATA, when set;
 *   2. backend/, when backend/.env exists — a source checkout, as before;
 *   3. otherwise `nodepress-data` next to the app folder — the server zip, where
 *      an upgrade replaces the app folder and leaves this one alone (like
 *      wp-content in WordPress).
 */
const fs = require('fs');
const path = require('path');

function dataDir(root = path.join(__dirname, '..')) {
  if (process.env.NODEPRESS_DATA) return path.resolve(process.env.NODEPRESS_DATA);
  const backend = path.join(root, 'backend');
  if (fs.existsSync(path.join(backend, '.env'))) return backend;
  return path.resolve(root, '..', 'nodepress-data');
}

module.exports = { dataDir };
