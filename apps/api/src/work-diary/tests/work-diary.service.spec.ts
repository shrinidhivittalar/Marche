import { WorkDiaryService } from '../services/work-diary.service';

const CONNECTION = {
  id: 'connection_1',
  clientProfileId: 'profile_client',
  providerProfileId: 'profile_provider',
};

function build() {
  const workDiaryRepository = {
    create: jest.fn().mockResolvedValue({ id: 'entry_1', note: 'Delivered the mockups' }),
    listForConnection: jest.fn().mockResolvedValue([]),
    listForProfile: jest.fn().mockResolvedValue([]),
    countForProfile: jest.fn().mockResolvedValue(0),
  };
  const connectionsService = {
    findById: jest.fn().mockResolvedValue(CONNECTION),
  };
  const profilesRepository = {
    findByUserId: jest.fn().mockResolvedValue({ id: 'profile_client' }),
  };

  const service = new WorkDiaryService(
    workDiaryRepository as never,
    connectionsService as never,
    profilesRepository as never,
  );

  return { service, workDiaryRepository, connectionsService, profilesRepository };
}

describe('WorkDiaryService', () => {
  describe('addEntry', () => {
    it('checks the caller is a party to the connection before writing', async () => {
      const { service, workDiaryRepository, connectionsService } = build();

      await service.addEntry('user_client', 'connection_1', 'Delivered the mockups');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_client', 'connection_1');
      expect(workDiaryRepository.create).toHaveBeenCalledWith(
        'connection_1',
        'user_client',
        'Delivered the mockups',
      );
    });

    it('rejects a caller who is not a party (via ConnectionsService throwing)', async () => {
      const { service, connectionsService } = build();
      connectionsService.findById.mockRejectedValue(new Error('not a party'));

      await expect(service.addEntry('user_stranger', 'connection_1', 'note')).rejects.toThrow(
        'not a party',
      );
    });
  });

  describe('listForConnection', () => {
    it('checks party access before reading the log', async () => {
      const { service, workDiaryRepository, connectionsService } = build();

      await service.listForConnection('user_provider', 'connection_1');

      expect(connectionsService.findById).toHaveBeenCalledWith('user_provider', 'connection_1');
      expect(workDiaryRepository.listForConnection).toHaveBeenCalledWith('connection_1');
    });
  });

  describe('listMine', () => {
    it("reads the caller's own profile-scoped aggregate log", async () => {
      const { service, workDiaryRepository } = build();
      workDiaryRepository.listForProfile.mockResolvedValue([{ id: 'entry_1' }]);
      workDiaryRepository.countForProfile.mockResolvedValue(1);

      const result = await service.listMine('user_client', { page: 1, limit: 20 });

      expect(workDiaryRepository.listForProfile).toHaveBeenCalledWith('profile_client', 0, 20);
      expect(result.data).toEqual([{ id: 'entry_1' }]);
      expect(result.pagination.total).toBe(1);
    });
  });
});
