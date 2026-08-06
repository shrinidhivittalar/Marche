import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Portfolio, Prisma } from '@marche/db';

@Injectable()
export class PortfolioRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    profileId: string;
    title: string;
    description: string;
    category?: string;
    coverImage?: string;
    projectDate?: Date;
    imageUrls: string[];
  }): Promise<Portfolio> {
    return this.prisma.client.portfolio.create({
      data: {
        profileId: data.profileId,
        title: data.title,
        description: data.description,
        category: data.category,
        coverImage: data.coverImage,
        projectDate: data.projectDate,
        images: { create: data.imageUrls.map((url) => ({ url })) },
      },
    });
  }

  findById(id: string) {
    return this.prisma.client.portfolio.findFirst({
      where: { id, deletedAt: null },
      include: { images: true },
    });
  }

  update(id: string, data: Prisma.PortfolioUpdateInput): Promise<Portfolio> {
    return this.prisma.client.portfolio.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Portfolio> {
    return this.prisma.client.portfolio.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
