import { Module } from '@nestjs/common';
import { ProfilesController } from './controllers/profiles.controller';
import { PortfolioController } from './controllers/portfolio.controller';
import { ExperienceController } from './controllers/experience.controller';
import { EducationController } from './controllers/education.controller';
import { CertificationController } from './controllers/certification.controller';
import { SkillsController } from './controllers/skills.controller';
import { LanguagesController } from './controllers/languages.controller';
import { ProfilesService } from './services/profiles.service';
import { PortfolioService } from './services/portfolio.service';
import { ExperienceService } from './services/experience.service';
import { EducationService } from './services/education.service';
import { CertificationService } from './services/certification.service';
import { SkillsService } from './services/skills.service';
import { LanguagesService } from './services/languages.service';
import { ProfilesRepository } from './repositories/profiles.repository';
import { PortfolioRepository } from './repositories/portfolio.repository';
import { ExperienceRepository } from './repositories/experience.repository';
import { EducationRepository } from './repositories/education.repository';
import { CertificationRepository } from './repositories/certification.repository';
import { SkillsRepository } from './repositories/skills.repository';
import { LanguagesRepository } from './repositories/languages.repository';

@Module({
  controllers: [
    ProfilesController,
    PortfolioController,
    ExperienceController,
    EducationController,
    CertificationController,
    SkillsController,
    LanguagesController,
  ],
  providers: [
    ProfilesService,
    PortfolioService,
    ExperienceService,
    EducationService,
    CertificationService,
    SkillsService,
    LanguagesService,
    ProfilesRepository,
    PortfolioRepository,
    ExperienceRepository,
    EducationRepository,
    CertificationRepository,
    SkillsRepository,
    LanguagesRepository,
  ],
  // ProfilesService.createForNewUser is called from AuthService at
  // registration time — exported so IdentityModule can inject it.
  //
  // ProfilesRepository is exported for MarketplaceModule, which reads
  // profiles (never writes them) to resolve service owners and to filter
  // discovery by location and availability. Exported rather than
  // re-registered there so there is one instance, not two.
  exports: [ProfilesService, ProfilesRepository],
})
export class ProfilesModule {}
