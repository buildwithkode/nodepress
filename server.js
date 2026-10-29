// Copyright (c) 2026-present BuildWithKode
// Licensed under the MIT License. See LICENSE file in the project root for details.

// NodePress in one process: the API also serves the admin, on PORT (default
// 3000). This is what the server zip starts, and what PM2 (`pm2 start
// server.js`), systemd or a host's "Node.js app" panel should run. From source,
// run `npm run build` first. Docker and `npm run dev` run the two separately.
//
// Settings, uploads and uploaded plugins live in the data folder (see
// scripts/data-dir.js): backend/ in a source checkout, ../nodepress-data for
// the zip, or NODEPRESS_DATA. With no .env there yet, the setup page runs
// first (scripts/setup-wizard.js).
//
// Outside a source checkout, pending database migrations are applied on every
// start, so an upgrade is: replace the app folder, start again.
// NODEPRESS_MIGRATE=0 turns that off, NODEPRESS_MIGRATE=1 turns it on anywhere.
'use strict';

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { dataDir } = require('./scripts/data-dir');
const { runSetup, migrate } = require('./scripts/setup-wizard');

const backend = path.join(__dirname, 'backend');
const admin = path.join(__dirname, 'frontend');

async function main() {
  for (const file of [path.join(backend, 'dist', 'main.js'), path.join(admin, '.next', 'BUILD_ID')]) {
    if (!fs.existsSync(file)) {
      console.error(`NodePress isn't built yet (${path.relative(__dirname, file)} is missing) — run: npm run build`);
      process.exit(1);
    }
  }

  const data = dataDir(__dirname);
  fs.mkdirSync(data, { recursive: true, mode: 0o700 });
  console.log(`📦 Data folder   ${data}`);

  const envFile = path.join(data, '.env');
  let justSetUp = false;
  if (!fs.existsSync(envFile)) {
    await runSetup({ root: __dirname, data, port: Number(process.env.PORT) || 3000 });
    justSetUp = true;
    // Phusion Passenger (cPanel's "Setup Node.js App") allows one listen() per
    // process and has already given it to the setup page: exit, and Passenger
    // starts NodePress on the next request.
    if (global.PhusionPassenger) {
      console.log('✔ Set up — NodePress starts on the next request');
      process.exit(0);
    }
  }

  // Load .env here (the API would too) so migrations see the same database.
  createRequire(path.join(backend, 'package.json'))('dotenv').config({ path: envFile });

  const autoMigrate = process.env.NODEPRESS_MIGRATE ? process.env.NODEPRESS_MIGRATE !== '0' : data !== backend;
  if (autoMigrate && !justSetUp) {
    const result = migrate(__dirname, process.env.DIRECT_URL || process.env.DATABASE_URL);
    if (!result.ok) {
      console.error(`${result.output}\n\nThe database couldn't be updated (prisma migrate deploy, above). NodePress didn't start.`);
      process.exit(1);
    }
    console.log('✔ Database up to date');
  }

  process.env.NODE_ENV ||= 'production';
  process.env.NODEPRESS_ADMIN_DIR ||= admin;
  process.env.PLUGINS_DIR ||= path.join(data, '.plugins');

  // The API reads .env and keeps uploads/ in its working directory.
  process.chdir(data);
  require(path.join(backend, 'dist', 'main.js'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
