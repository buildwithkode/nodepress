import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  auditLog: {
    create: jest.fn(),
  },
};

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AuditService);
  });

  // ── log() ───────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('writes an audit record with actor details', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 1 });

      await service.log(
        { id: 1, email: 'admin@test.com', ip: '127.0.0.1' },
        'created', 'entry', 'my-blog-post',
        { contentType: 'blog' },
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId:    1,
          userEmail: 'admin@test.com',
          action:    'created',
          resource:  'entry',
          resourceId: 'my-blog-post',
          metadata:  { contentType: 'blog' },
          ip:        '127.0.0.1',
        }),
      });
    });

    it('uses null userId when actor has no id', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 2 });

      await service.log(
        { email: 'system@test.com' },
        'deleted', 'media', 'photo.jpg',
      );

      const callData = mockPrisma.auditLog.create.mock.calls[0][0].data;
      expect(callData.userId).toBeNull();
      expect(callData.ip).toBeNull();
      expect(callData.metadata).toBeNull();
    });

    it('does not throw when prisma.create fails — audit failure is non-blocking', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

      // Should NOT throw — audit errors are swallowed to protect the caller
      await expect(
        service.log({ id: 1, email: 'admin@test.com' }, 'updated', 'entry', 'slug', {}),
      ).resolves.toBeUndefined();
    });
  });
});
