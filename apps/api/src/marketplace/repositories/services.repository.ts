import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { publicServiceWhere } from '../marketplace-visibility';
import type { Prisma, Service, ServiceSkill } from '@marche/db';

export type ServiceSort = 'newest' | 'price_low' | 'price_high';

export interface ServiceSearchFilters {
  q?: string;
  categoryIds?: string[];
  skillIds?: string[];
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  availability?: 'AVAILABLE' | 'LIMITED' | 'UNAVAILABLE';
}

// Every sort ends with `id` so the order is total. Without it Postgres may
// return rows in a different order for the same page across requests, and
// items can duplicate or vanish while the user pages through results.
const SORT_ORDER: Record<ServiceSort, Prisma.ServiceOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  price_low: [{ startingPrice: 'asc' }, { id: 'asc' }],
  price_high: [{ startingPrice: 'desc' }, { id: 'asc' }],
};

// Provider discovery sorts over aggregates of each provider's matching
// services: their newest listing, or their cheapest/priciest one.
//
// `satisfies` rather than a type annotation: groupBy's signature checks that
// every orderBy key also appears in `by`, and it can only do that if the
// literal types survive. An explicit Record<> annotation widens them and the
// call stops compiling.
const PROVIDER_SORT_ORDER = {
  newest: [{ _max: { createdAt: 'desc' } }, { profileId: 'asc' }],
  price_low: [{ _min: { startingPrice: 'asc' } }, { profileId: 'asc' }],
  price_high: [{ _max: { startingPrice: 'desc' } }, { profileId: 'asc' }],
} satisfies Record<ServiceSort, Prisma.ServiceOrderByWithAggregationInput[]>;

const CARD_FIELDS = {
  id: true,
  title: true,
  startingPrice: true,
  deliveryDays: true,
  tags: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
  profile: {
    select: {
      id: true,
      username: true,
      displayName: true,
      headline: true,
      avatar: true,
      location: true,
      availabilityStatus: true,
      verifiedAt: true,
    },
  },
  skills: { select: { skill: { select: { id: true, name: true } } } },
} satisfies Prisma.ServiceSelect;

@Injectable()
export class ServicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- owner-facing reads (any status, own listings only) ----------

  findById(id: string) {
    return this.prisma.client.service.findFirst({
      where: { id, deletedAt: null },
      include: { skills: true },
    });
  }

  listByProfile(profileId: string, skip: number, take: number) {
    return this.prisma.client.service.findMany({
      where: { profileId, deletedAt: null },
      orderBy: SORT_ORDER.newest,
      skip,
      take,
      select: CARD_FIELDS,
    });
  }

  countByProfile(profileId: string) {
    return this.prisma.client.service.count({ where: { profileId, deletedAt: null } });
  }

  // ---------- public reads (visibility filter always applied) ----------

  findPublicById(id: string) {
    return this.prisma.client.service.findFirst({
      where: publicServiceWhere({ id }),
      select: { ...CARD_FIELDS, description: true },
    });
  }

  search(filters: ServiceSearchFilters, sort: ServiceSort, skip: number, take: number) {
    return this.prisma.client.service.findMany({
      where: publicServiceWhere(this.buildFilters(filters)),
      orderBy: SORT_ORDER[sort],
      skip,
      take,
      select: CARD_FIELDS,
    });
  }

  countSearch(filters: ServiceSearchFilters) {
    return this.prisma.client.service.count({
      where: publicServiceWhere(this.buildFilters(filters)),
    });
  }

  // ---------- provider discovery ----------

  // Deduplicated by provider: a provider with eight matching services must
  // appear once, carrying their cheapest matching price as the "from" signal.
  //
  // groupBy, not findMany({ distinct }): Prisma applies `distinct` after
  // take/skip in the query engine, so distinct + pagination silently returns
  // short pages. groupBy paginates over the grouped rows, which is what the
  // page numbers actually refer to.
  searchProviders(filters: ServiceSearchFilters, sort: ServiceSort, skip: number, take: number) {
    return this.prisma.client.service.groupBy({
      by: ['profileId'],
      where: publicServiceWhere(this.buildFilters(filters)),
      _min: { startingPrice: true },
      _max: { createdAt: true },
      orderBy: PROVIDER_SORT_ORDER[sort],
      skip,
      take,
    });
  }

  // Counts distinct providers, not matching services. Using the service
  // count here would inflate totalPages and leave trailing pages empty.
  //
  // groupBy returns one row per provider and is counted in memory: Prisma
  // has no count-distinct primitive, and the alternative is raw SQL, which
  // the spec rules out of the search path. Fine at MVP volume; revisit if
  // the provider count reaches the tens of thousands.
  async countSearchProviders(filters: ServiceSearchFilters): Promise<number> {
    const groups = await this.prisma.client.service.groupBy({
      by: ['profileId'],
      where: publicServiceWhere(this.buildFilters(filters)),
    });
    return groups.length;
  }

  // Cards for an already-resolved, already-ordered page of providers.
  // Ordering is reapplied by the caller, since `in` does not preserve order.
  findProviderCards(profileIds: string[]) {
    return this.prisma.client.profile.findMany({
      where: { id: { in: profileIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        headline: true,
        avatar: true,
        location: true,
        availabilityStatus: true,
        verifiedAt: true,
      },
    });
  }

  // ---------- writes ----------

  create(data: Prisma.ServiceUncheckedCreateInput): Promise<Service> {
    return this.prisma.client.service.create({ data });
  }

  update(id: string, data: Prisma.ServiceUpdateInput): Promise<Service> {
    return this.prisma.client.service.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<Service> {
    return this.prisma.client.service.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ---------- service skills ----------

  addSkill(serviceId: string, skillId: string): Promise<ServiceSkill> {
    return this.prisma.client.serviceSkill.create({ data: { serviceId, skillId } });
  }

  removeSkill(serviceId: string, skillId: string) {
    return this.prisma.client.serviceSkill.delete({
      where: { serviceId_skillId: { serviceId, skillId } },
    });
  }

  findSkillIds(serviceId: string) {
    return this.prisma.client.serviceSkill.findMany({
      where: { serviceId },
      select: { skillId: true },
    });
  }

  countExistingSkills(skillIds: string[]) {
    return this.prisma.client.skill.count({ where: { id: { in: skillIds } } });
  }

  // ---------- filter construction ----------

  private buildFilters(filters: ServiceSearchFilters): Prisma.ServiceWhereInput {
    const and: Prisma.ServiceWhereInput[] = [];

    if (filters.q) {
      const q = filters.q.trim();
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          // Tags match whole-tag, not substring: Prisma's array filters
          // (`has`) compare complete elements, and there is no substring
          // operator for String[]. Tags are stored normalised to lowercase
          // on write, so this is at least case-insensitive. Searching
          // "balloon" therefore will not surface the tag "balloon artistry"
          // — a known limitation of keeping raw SQL out of the search path.
          { tags: { has: q.toLowerCase() } },
        ],
      });
    }

    if (filters.categoryIds?.length) {
      and.push({ categoryId: { in: filters.categoryIds } });
    }

    // Every requested skill must be present, not any of them: adding a
    // filter should narrow results. An OR here would make each extra skill
    // widen the set, which reads to users as broken.
    if (filters.skillIds?.length) {
      for (const skillId of filters.skillIds) {
        and.push({ skills: { some: { skillId } } });
      }
    }

    if (filters.minPrice !== undefined) {
      and.push({ startingPrice: { gte: filters.minPrice } });
    }
    if (filters.maxPrice !== undefined) {
      and.push({ startingPrice: { lte: filters.maxPrice } });
    }

    // Location and availability live on the Profile — the Profiles module
    // owns them, and Service deliberately holds no copy to keep in sync.
    if (filters.location) {
      and.push({ profile: { location: { contains: filters.location, mode: 'insensitive' } } });
    }
    if (filters.availability) {
      and.push({ profile: { availabilityStatus: filters.availability } });
    }

    return and.length ? { AND: and } : {};
  }
}
