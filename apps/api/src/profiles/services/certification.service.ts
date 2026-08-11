import { Injectable, NotFoundException } from '@nestjs/common';
import { ProfilesRepository } from '../repositories/profiles.repository';
import { CertificationRepository } from '../repositories/certification.repository';
import { assertOwnership, assertProviderRole } from '../profile-access.util';
import type { CreateCertificationDto, UpdateCertificationDto } from '../dto/certification.dto';
import type { Certification } from '@marche/db';

@Injectable()
export class CertificationService {
  constructor(
    private readonly profilesRepository: ProfilesRepository,
    private readonly certificationRepository: CertificationRepository,
  ) {}

  async create(userId: string, dto: CreateCertificationDto): Promise<Certification> {
    const profile = await this.getOwnProfile(userId);
    assertProviderRole(profile.user.role);

    // Fields are enumerated rather than spread, matching Service.create: a
    // field added to the DTO later reaches the database only when someone
    // adds it here deliberately.
    return this.certificationRepository.create({
      profileId: profile.id,
      name: dto.name,
      issuingOrganization: dto.issuingOrganization,
      issueDate: dto.issueDate,
      expiryDate: dto.expiryDate,
    });
  }

  async update(
    userId: string,
    certificationId: string,
    dto: UpdateCertificationDto,
  ): Promise<Certification> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.certificationRepository.findById(certificationId);
    if (!existing) {
      throw new NotFoundException('Certification not found');
    }
    assertOwnership(existing.profileId, profile.id);

    return this.certificationRepository.update(certificationId, dto);
  }

  async remove(userId: string, certificationId: string): Promise<void> {
    const profile = await this.getOwnProfile(userId);
    const existing = await this.certificationRepository.findById(certificationId);
    if (!existing) {
      throw new NotFoundException('Certification not found');
    }
    assertOwnership(existing.profileId, profile.id);

    await this.certificationRepository.delete(certificationId);
  }

  private async getOwnProfile(userId: string) {
    const profile = await this.profilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }
}
