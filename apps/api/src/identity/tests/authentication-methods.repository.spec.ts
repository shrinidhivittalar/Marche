import { AuthenticationMethodsRepository } from '../repositories/authentication-methods.repository';
import type { PrismaService } from '../../prisma/prisma.service';

describe('AuthenticationMethodsRepository', () => {
  let authenticationMethod: { findUnique: jest.Mock; create: jest.Mock };
  let prismaService: jest.Mocked<PrismaService>;
  let repository: AuthenticationMethodsRepository;

  beforeEach(() => {
    authenticationMethod = { findUnique: jest.fn(), create: jest.fn() };
    prismaService = {
      client: { authenticationMethod },
    } as unknown as jest.Mocked<PrismaService>;
    repository = new AuthenticationMethodsRepository(prismaService);
  });

  it('findByGoogleSub looks up by (provider, providerAccountId), never by email', async () => {
    authenticationMethod.findUnique.mockResolvedValue({ id: 'm1' });

    const result = await repository.findByGoogleSub('sub-1');

    expect(result).toEqual({ id: 'm1' });
    expect(authenticationMethod.findUnique).toHaveBeenCalledWith({
      where: { provider_providerAccountId: { provider: 'GOOGLE', providerAccountId: 'sub-1' } },
    });
  });

  it('findByUserAndProvider looks up by (userId, provider)', async () => {
    authenticationMethod.findUnique.mockResolvedValue(null);

    await repository.findByUserAndProvider('user_1', 'GOOGLE');

    expect(authenticationMethod.findUnique).toHaveBeenCalledWith({
      where: { userId_provider: { userId: 'user_1', provider: 'GOOGLE' } },
    });
  });

  it('createGoogle writes a GOOGLE row for the given user and sub', async () => {
    authenticationMethod.create.mockResolvedValue({ id: 'm1' });

    await repository.createGoogle('user_1', 'sub-1');

    expect(authenticationMethod.create).toHaveBeenCalledWith({
      data: { userId: 'user_1', provider: 'GOOGLE', providerAccountId: 'sub-1' },
    });
  });

  it('createGoogle runs inside the given transaction client when one is passed', async () => {
    const txCreate = jest.fn().mockResolvedValue({ id: 'm1' });
    const tx = { authenticationMethod: { create: txCreate } } as never;

    await repository.createGoogle('user_1', 'sub-1', tx);

    expect(txCreate).toHaveBeenCalled();
    expect(authenticationMethod.create).not.toHaveBeenCalled();
  });
});
