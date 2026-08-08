import { prisma } from '../src/client';

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

async function main() {
  await seedSkills();
  await seedCategories();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
