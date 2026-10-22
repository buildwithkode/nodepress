import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate()', () => {
  const prisma = { user: { findUnique: jest.fn() } };
  const roles = { resolve: jest.fn() };
  const strategy = new JwtStrategy(prisma as any, roles as any);

  beforeEach(() => jest.clearAllMocks());

  it('passes a built-in role through', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 1, email: 'a@test.com', role: 'editor' });
    roles.resolve.mockResolvedValue({ role: 'editor' });
    expect(await strategy.validate({ sub: 1, email: 'a@test.com' })).toEqual({ id: 1, email: 'a@test.com', role: 'editor' });
  });

  it('runs a custom role as its base role and exposes customRole', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 2, email: 'r@test.com', role: 'reviewer' });
    roles.resolve.mockResolvedValue({ role: 'contributor', customRole: 'reviewer' });
    expect(await strategy.validate({ sub: 2, email: 'r@test.com' })).toEqual({
      id: 2, email: 'r@test.com', role: 'contributor', customRole: 'reviewer',
    });
    expect(roles.resolve).toHaveBeenCalledWith('reviewer');
  });

  it('runs an unknown role as viewer', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 3, email: 'g@test.com', role: 'ghost' });
    roles.resolve.mockResolvedValue({ role: 'viewer', customRole: 'ghost' });
    expect(await strategy.validate({ sub: 3, email: 'g@test.com' })).toMatchObject({ role: 'viewer', customRole: 'ghost' });
  });

  it('rejects a deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(strategy.validate({ sub: 9, email: 'x@test.com' })).rejects.toThrow(UnauthorizedException);
  });
});
