import Project from '@/models/Project';

// Canonical definition of the current default event. An Admin setting can point
// DEFAULT_EVENT_SLUG at a different seeded event later without code changes.
export const AUTOMATION_EXPO_2026 = {
  slug: 'automation-expo-2026',
  name: 'Automation Expo 2026',
  type: 'exhibition',
  campaignName: 'OnePWS Future Control Room Experience',
  description: 'OnePWS Future Control Room Experience',
  startDate: new Date('2026-07-22T00:00:00.000Z'),
  endDate: new Date('2026-07-25T23:59:59.999Z'),
  eventDate: new Date('2026-07-22T00:00:00.000Z'),
  venue: 'BEC, NESCO, Goregaon East, Mumbai',
  hall: 'Hall 6',
  city: 'Mumbai',
  state: 'Maharashtra',
  country: 'India',
  location: 'Hall 6, BEC NESCO, Goregaon East, Mumbai',
  color: '#e63232',
  isDefault: true,
  isActive: true,
  isLocked: true,
};

export const DEFAULT_EVENT_SLUG = AUTOMATION_EXPO_2026.slug;

// Idempotently ensure the given user owns the default event project and it is
// marked as their default scanner destination. Safe to call on every login /
// scanner open — it upserts by (userId, slug) and never creates duplicates.
export async function ensureDefaultProject(userId, event = AUTOMATION_EXPO_2026) {
  const { slug, ...fields } = event;

  // Upsert the event itself. $setOnInsert for identity, $set for metadata so an
  // updated event definition (e.g. venue correction) propagates on next call.
  const project = await Project.findOneAndUpdate(
    { userId, slug },
    {
      $setOnInsert: { userId, slug },
      $set: {
        name: fields.name,
        type: fields.type,
        description: fields.description,
        campaignName: fields.campaignName,
        startDate: fields.startDate,
        endDate: fields.endDate,
        eventDate: fields.eventDate,
        venue: fields.venue,
        hall: fields.hall,
        city: fields.city,
        state: fields.state,
        country: fields.country,
        location: fields.location,
        color: fields.color,
        isActive: fields.isActive,
        isLocked: fields.isLocked,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  // Ensure exactly one default project per user points at this event.
  if (!project.isDefault) {
    await Project.updateMany({ userId, isDefault: true, _id: { $ne: project._id } }, { $set: { isDefault: false } });
    project.isDefault = true;
    await project.save();
  }

  return project;
}
