import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { UserLanguage, LanguageProficiency } from '@marche/db';

@Injectable()
export class LanguagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserLanguage(profileId: string, language: string) {
    return this.prisma.client.userLanguage.findUnique({
      where: { profileId_language: { profileId, language } },
    });
  }

  findUserLanguageById(id: string) {
    return this.prisma.client.userLanguage.findUnique({ where: { id } });
  }

  addLanguage(
    profileId: string,
    language: string,
    proficiency: LanguageProficiency,
  ): Promise<UserLanguage> {
    return this.prisma.client.userLanguage.create({ data: { profileId, language, proficiency } });
  }

  removeLanguage(id: string): Promise<UserLanguage> {
    return this.prisma.client.userLanguage.delete({ where: { id } });
  }
}
