import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module';
import { ProposalsModule } from '../proposals/proposals.module';
import { ConnectionWorkDiaryController } from './controllers/connection-work-diary.controller';
import { WorkDiaryHistoryController } from './controllers/work-diary-history.controller';
import { WorkDiaryRepository } from './repositories/work-diary.repository';
import { WorkDiaryService } from './services/work-diary.service';

// Depends on ProposalsModule for ConnectionsService (party-authorization —
// same reuse Disputes and Payments already do) and ProfilesModule to
// resolve the caller's own profile id for listMine.
@Module({
  imports: [ProfilesModule, ProposalsModule],
  controllers: [ConnectionWorkDiaryController, WorkDiaryHistoryController],
  providers: [WorkDiaryRepository, WorkDiaryService],
})
export class WorkDiaryModule {}
