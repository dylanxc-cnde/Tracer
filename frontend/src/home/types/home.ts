import type { PostingCard } from '../../postings/types/postingCard'

export type ApplicationStatus = 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn'
export type EventKind = 'interview' | 'deadline' | 'other'
export type ActivityKind = 'card_saved' | 'card_updated' | 'task_completed' | 'application_recorded'
  | 'application_status_changed' | 'event_recorded' | 'event_adjusted'
export type CreateTaskRequest = { task_id: string; title: string; due_on?: string | null }
export type Task = CreateTaskRequest & { due_on: string | null; created_at: string; completed_at: string | null }
export type CreateEventRequest = {
  event_id: string; kind: EventKind; title: string; starts_at: string
  ends_at?: string | null; card_key?: string | null; cancelled?: boolean
}
export type ScheduleEvent = CreateEventRequest & {
  ends_at: string | null; card_key: string | null; cancelled: boolean; created_at: string
}
export type AdjustEventRequest = Partial<Omit<CreateEventRequest, 'event_id'>>
export type CreateApplicationRequest = {
  application_id: string; card_key: string; applied_on: string; status?: ApplicationStatus
}
export type ApplicationRecord = CreateApplicationRequest & {
  status: ApplicationStatus; created_at: string; updated_at: string
}
export type ActivityEvent = {
  event_id: string; kind: ActivityKind; occurred_at: string; subject_key: string; card_key: string | null
}
export type HomeActivityData = { events: ActivityEvent[]; recording_started_at: string | null }
export type EventView = { event: ScheduleEvent; card_missing: boolean }
export type HomeOverview = {
  today: { tasks: Task[]; completed_count: number; completed_tasks: Task[]; events: EventView[] }
  upcoming: { events: EventView[]; tasks: Task[] }
  your_search: { active: number; awaiting_reply: number; interviews: number }
  applications: { record: ApplicationRecord; card_missing: boolean }[]
  recent_jobs: { card: PostingCard; application: ApplicationRecord | null }[]
  recent_activity: { event: ActivityEvent; card_missing: boolean }[]
  ai_usage: {
    status: 'not_recorded'; tokens: null; estimated_cost_usd: null
    providers: {
      provider_key: string; display_name: string; provider: string; monthly_budget_usd: number | null
      budget_status: 'not_set' | 'zero' | 'set'
    }[]
  }
}
export type OverviewWindow = {
  today: string; day_start: string; day_end: string; upcoming_end: string; interviews_end: string
}
