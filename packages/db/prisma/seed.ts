import { prisma, type CategoryTemplateFieldType, type ServiceMode } from '../src/client';

// Predefined platform skills, sourced from the categories already used
// across the app's existing talent/mock data — this is an event-services
// marketplace, not a generic dev-freelance one, so the seed list reflects
// that domain instead of a generic "Java, React, ..." example set.
const SKILLS = [
  'AV Setup',
  'Budgeting',
  'Capacity Planning',
  'Day-Of Logistics',
  'Event Catering',
  'Event Coordination',
  'Event Hosting',
  'Event Photography',
  'Event Styling',
  'Floral Design',
  'Installation',
  'Lighting Sync',
  'Lightroom',
  'Live Mixing',
  'MC Hosting',
  'Menu Design',
  'On-Site Production',
  'Photo Editing',
  'Sound Engineering',
  'Sourcing',
  'Staffing',
  'Vendor Management',
  'Venue Management',
  'Wine Pairing',
];

// Marketplace discovery taxonomy (docs/modules/module3.md). Two levels:
// a parent and its children. Same domain as the skill list above — this is
// an event-services marketplace, so the tree reflects that rather than the
// generic Photography/Design/Development example in the spec.
//
// Children are what providers actually attach services to; parents exist
// to group them in the browse UI and to roll up in filters.
const CATEGORIES: { name: string; slug: string; children: { name: string; slug: string }[] }[] = [
  {
    name: 'Photography & Video',
    slug: 'photography-video',
    children: [
      { name: 'Event Photography', slug: 'event-photography' },
      { name: 'Wedding Photography', slug: 'wedding-photography' },
      { name: 'Videography', slug: 'videography' },
      { name: 'Photo & Video Editing', slug: 'photo-video-editing' },
    ],
  },
  {
    name: 'Catering & Bar',
    slug: 'catering-bar',
    children: [
      { name: 'Event Catering', slug: 'event-catering' },
      { name: 'Bartending', slug: 'bartending' },
      { name: 'Menu & Tasting Design', slug: 'menu-tasting-design' },
    ],
  },
  {
    name: 'Planning & Coordination',
    slug: 'planning-coordination',
    children: [
      { name: 'Full Event Planning', slug: 'full-event-planning' },
      { name: 'Day-Of Coordination', slug: 'day-of-coordination' },
      { name: 'Vendor Management', slug: 'vendor-management' },
    ],
  },
  {
    name: 'Decor & Styling',
    slug: 'decor-styling',
    children: [
      { name: 'Floral Design', slug: 'floral-design' },
      { name: 'Event Styling', slug: 'event-styling' },
      { name: 'Lighting Design', slug: 'lighting-design' },
    ],
  },
  {
    name: 'Entertainment',
    slug: 'entertainment',
    children: [
      { name: 'Live Music', slug: 'live-music' },
      { name: 'DJ', slug: 'dj' },
      { name: 'MC & Hosting', slug: 'mc-hosting' },
    ],
  },
  {
    name: 'Production & AV',
    slug: 'production-av',
    children: [
      { name: 'Sound Engineering', slug: 'sound-engineering' },
      { name: 'AV Setup', slug: 'av-setup' },
      { name: 'Staging & Rigging', slug: 'staging-rigging' },
    ],
  },
];

// Standalone top-level demo categories with a configured requirement
// template, approved for production. Distinct from the CATEGORIES
// taxonomy above — these aren't part of the six-branch discovery tree,
// each is its own top-level category with a fully configured template
// (allowed modes, location requirement, requirement fields), matching
// what was built and approved via the admin category-template editor.
interface DemoTemplateField {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  order: number;
  options?: string[];
  validation?: Record<string, number>;
}

interface DemoCategory {
  slug: string;
  name: string;
  displayOrder: number;
  allowedModes: ServiceMode[];
  locationRequired: boolean;
  fields: DemoTemplateField[];
}

const DEMO_CATEGORIES: DemoCategory[] = [
  {
    slug: 'photography',
    name: 'Photography',
    displayOrder: 6,
    allowedModes: ['ONSITE', 'HYBRID'],
    locationRequired: true,
    fields: [
      {
        key: 'photography-type',
        label: 'Type of photography',
        type: 'SELECT',
        required: true,
        order: 0,
        options: ['Wedding', 'Event', 'Portrait', 'Product', 'Real Estate'],
      },
      { key: 'event-date', label: 'Event date', type: 'DATE', required: true, order: 1 },
      {
        key: 'number-of-hours',
        label: 'Number of hours',
        type: 'NUMBER',
        required: true,
        order: 2,
        validation: { min: 1, max: 24 },
      },
      {
        key: 'number-of-guests',
        label: 'Number of guests',
        type: 'NUMBER',
        required: false,
        order: 3,
        validation: { min: 0 },
      },
      {
        key: 'indoor-outdoor',
        label: 'Indoor / Outdoor',
        type: 'SELECT',
        required: true,
        order: 4,
        options: ['Indoor', 'Outdoor', 'Both'],
      },
      {
        key: 'delivery-style',
        label: 'Preferred photo delivery',
        type: 'SELECT',
        required: true,
        order: 5,
        options: ['Digital only', 'Printed album', 'Both digital and printed'],
      },
    ],
  },
  {
    slug: 'painting',
    name: 'Painting',
    displayOrder: 7,
    allowedModes: ['ONSITE'],
    locationRequired: true,
    fields: [
      {
        key: 'painting-type',
        label: 'Type of painting',
        type: 'SELECT',
        required: true,
        order: 0,
        options: ['Interior', 'Exterior', 'Both'],
      },
      {
        key: 'property-type',
        label: 'Property type',
        type: 'SELECT',
        required: true,
        order: 1,
        options: ['Apartment', 'Villa', 'Office', 'Commercial'],
      },
      {
        key: 'number-of-rooms',
        label: 'Number of rooms',
        type: 'NUMBER',
        required: true,
        order: 2,
        validation: { min: 1 },
      },
      {
        key: 'approximate-area',
        label: 'Approximate area (sq ft)',
        type: 'NUMBER',
        required: false,
        order: 3,
        validation: { min: 0 },
      },
      {
        key: 'material-preference',
        label: 'Paint/material preference',
        type: 'MULTI_SELECT',
        required: false,
        order: 4,
        options: ['Emulsion', 'Enamel', 'Textured', 'Eco-friendly'],
      },
      {
        key: 'wall-condition',
        label: 'Current wall condition',
        type: 'SELECT',
        required: true,
        order: 5,
        options: ['Good', 'Minor damage', 'Major repair needed'],
      },
    ],
  },
  {
    slug: 'electrical-work',
    name: 'Electrical Work',
    displayOrder: 8,
    allowedModes: ['ONSITE'],
    locationRequired: true,
    fields: [
      {
        key: 'electrical-work-type',
        label: 'Type of electrical work',
        type: 'SELECT',
        required: true,
        order: 0,
        options: ['Wiring', 'Repair', 'Installation', 'Inspection'],
      },
      {
        key: 'property-type',
        label: 'Property type',
        type: 'SELECT',
        required: true,
        order: 1,
        options: ['Residential', 'Commercial', 'Industrial'],
      },
      {
        key: 'urgency',
        label: 'Urgency',
        type: 'SELECT',
        required: true,
        order: 2,
        options: ['Emergency', 'Within a week', 'Flexible'],
      },
      {
        key: 'rooms-affected',
        label: 'Number of rooms/areas affected',
        type: 'NUMBER',
        required: true,
        order: 3,
        validation: { min: 1 },
      },
      {
        key: 'issue-description',
        label: 'Description of issue',
        type: 'TEXT',
        required: true,
        order: 4,
        validation: { minLength: 10, maxLength: 500 },
      },
      {
        key: 'power-outage-scope',
        label: 'Scope of electrical issue',
        type: 'SELECT',
        required: true,
        order: 5,
        options: ['Single room', 'Multiple rooms', 'Entire property', 'Common area / building'],
      },
    ],
  },
];

async function seedSkills() {
  for (const name of SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`Seeded ${SKILLS.length} skills.`);
}

// Upserts by slug so re-running never duplicates, and so categories added
// by an admin after the first run survive a re-seed untouched. Parents are
// written before their children because a child needs its parent's id.
async function seedCategories() {
  let parentCount = 0;
  let childCount = 0;

  for (const [index, parent] of CATEGORIES.entries()) {
    const parentRow = await prisma.category.upsert({
      where: { slug: parent.slug },
      create: { name: parent.name, slug: parent.slug, displayOrder: index },
      update: { name: parent.name, displayOrder: index },
    });
    parentCount += 1;

    for (const [childIndex, child] of parent.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        create: {
          name: child.name,
          slug: child.slug,
          parentId: parentRow.id,
          displayOrder: childIndex,
        },
        update: { name: child.name, parentId: parentRow.id, displayOrder: childIndex },
      });
      childCount += 1;
    }
  }

  console.log(`Seeded ${parentCount} parent categories and ${childCount} child categories.`);
}

// Attributes seeded templates to whichever Super Admin already exists —
// there is no "system user" concept in this schema
// (CategoryTemplate.createdByUserId is a real FK and an audit trail of who
// configured it, per that model's own comment, not a placeholder). If none
// exists yet — a brand-new environment before the bootstrap script has
// run — template seeding is skipped rather than failing the deploy; the
// categories themselves are still created either way.
async function seedDemoCategoryTemplates() {
  const admin = await prisma.user.findFirst({
    where: { platformRole: 'SUPER_ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    console.log('No Super Admin exists yet — skipping demo category template seeding.');
    return;
  }

  let created = 0;
  for (const demo of DEMO_CATEGORIES) {
    // Create-only, unlike seedCategories' upsert: these are standalone
    // categories an admin can independently own, not a fixed taxonomy this
    // seed is the source of truth for. If the slug already exists —
    // seeded by an earlier run, or created independently by a real admin
    // — its name/displayOrder must never be forced back to the seed's
    // values on a later deploy.
    const category = await prisma.category.upsert({
      where: { slug: demo.slug },
      create: { name: demo.name, slug: demo.slug, displayOrder: demo.displayOrder },
      update: {},
    });

    // Never overrides an existing configuration — if an admin has already
    // set an active template (here or by hand in the admin UI), re-seeding
    // must not create a competing version and switch the pointer out from
    // under them. Same non-destructive intent as seedCategories' upsert.
    if (category.activeCategoryTemplateId) {
      continue;
    }

    // Same create-then-activate transaction shape as
    // CategoryTemplatesRepository.createAndActivate — a template that
    // exists but isn't yet the category's active one is a state nothing
    // downstream is designed to handle.
    await prisma.$transaction(async (tx) => {
      const template = await tx.categoryTemplate.create({
        data: {
          categoryId: category.id,
          createdByUserId: admin.id,
          allowedModes: demo.allowedModes,
          locationRequired: demo.locationRequired,
          fields: { create: demo.fields },
        },
      });
      await tx.category.update({
        where: { id: category.id },
        data: { activeCategoryTemplateId: template.id },
      });
    });
    created += 1;
  }

  console.log(`Seeded ${created} demo category template(s).`);
}

async function main() {
  await seedSkills();
  await seedCategories();
  await seedDemoCategoryTemplates();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
