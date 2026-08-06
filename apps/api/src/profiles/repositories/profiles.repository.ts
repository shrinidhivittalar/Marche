import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Profile, Prisma } from '@marche/db';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { userId: string; displayName: string }): Promise<Profile> {
    return this.prisma.client.profile.create({ data });
  }

  findByUserId(userId: string) {
    return this.prisma.client.profile.findUnique({
      where: { userId },
      include: { user: { select: { role: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.client.profile.findUnique({
      where: { id },
      include: { user: { select: { role: true } } },
    });
  }

  findByUsername(username: string) {
    return this.prisma.client.profile.findUnique({
      where: { username },
      include: { user: { select: { role: true } } },
    });
  }

  findByUsernameExcludingProfile(username: string, excludeProfileId: string) {
    return this.prisma.client.profile.findFirst({
      where: { username, NOT: { id: excludeProfileId } },
    });
  }

  update(id: string, data: Prisma.ProfileUpdateInput): Promise<Profile> {
    return this.prisma.client.profile.update({ where: { id }, data });
  }

  withDetails(profileId: string) {
    return this.prisma.client.profile.findUnique({
      where: { id: profileId },
      include: {
        portfolioItems: { where: { deletedAt: null }, include: { images: true } },
        experiences: true,
        educations: true,
        certifications: true,
        skills: { include: { skill: true } },
        languages: true,
      },
    });
  }
}
