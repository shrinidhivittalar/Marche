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

async function main() {
  for (const name of SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }
  console.log(`Seeded ${SKILLS.length} skills.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
