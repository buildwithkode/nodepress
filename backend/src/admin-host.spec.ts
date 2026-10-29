import { isApiPath } from './admin-host';

describe('isApiPath', () => {
  it.each(['/api', '/api/health', '/api/realtime/', '/uploads/a.png', '/graphql', '/api/auth/oidc/callback'])(
    'sends %s to the API',
    (path) => expect(isApiPath(path)).toBe(true),
  );

  it.each(['/', '/login', '/entries/blog', '/_next/static/x.js', '/api/draft', '/api/disable-draft', '/apis', '/uploads-old'])(
    'sends %s to the admin',
    (path) => expect(isApiPath(path)).toBe(false),
  );
});
