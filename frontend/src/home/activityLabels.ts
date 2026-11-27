import type { ActivityKind } from './types/home'

export const activityLabels: Record<ActivityKind, string> = {
  card_saved: 'Job saved',
  card_updated: 'Job updated',
  task_completed: 'Task completed',
  application_recorded: 'Application recorded',
  application_status_changed: 'Application status changed',
  event_recorded: 'Event recorded',
  event_adjusted: 'Event adjusted',
}
