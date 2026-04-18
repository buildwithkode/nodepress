// Load .env BEFORE any module is imported — mirrors what main.ts does at runtime.
// Jest imports test files (and their transitive deps like env.ts / AppModule) after
// setupFiles run, so process.env is populated by the time Zod validates it.
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
