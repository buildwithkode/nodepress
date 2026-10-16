jest.mock('../config/env', () => ({
  env: { CORS_ORIGIN: 'https://app.example.com, https://admin.example.com', NODE_ENV: 'production' },
}));

import { env } from '../config/env';
import { corsOrigin } from './cors-origin';

function check(origin: string | undefined) {
  let result: boolean | string | undefined;
  corsOrigin(origin, (_err, allowed) => { result = allowed; });
  return result;
}

describe('corsOrigin', () => {
  afterEach(() => {
    (env as any).CORS_ORIGIN = 'https://app.example.com, https://admin.example.com';
    (env as any).NODE_ENV = 'production';
  });

  it('allows every entry of a comma-separated list', () => {
    expect(check('https://app.example.com')).toBe(true);
    expect(check('https://admin.example.com')).toBe(true);
  });

  it('omits CORS headers for other origins instead of erroring', () => {
    expect(check('https://evil.example.com')).toBe(false);
  });

  it('allows requests without an Origin header', () => {
    expect(check(undefined)).toBe(true);
  });

  it('only allows arbitrary localhost ports outside production', () => {
    expect(check('http://localhost:4321')).toBe(false);
    (env as any).NODE_ENV = 'development';
    expect(check('http://localhost:4321')).toBe(true);
    expect(check('http://127.0.0.1:9999')).toBe(true);
  });

  it("sends a literal '*' for a wildcard instead of echoing the origin", () => {
    (env as any).CORS_ORIGIN = '*';
    expect(check('https://anything.example.com')).toBe('*');
  });
});
