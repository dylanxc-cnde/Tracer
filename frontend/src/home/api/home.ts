import { listPostingCards } from '../../postings/api/postings'
import type { PostingCard } from '../../postings/types/postingCard'
import type {
  AdjustEventRequest, ApplicationRecord, ApplicationStatus, CreateApplicationRequest,
  CreateEventRequest, CreateTaskRequest, HomeActivityData, HomeOverview, OverviewWindow, ScheduleEvent, Task,
} from '../types/home'

const API_BASE_URL = 'http://127.0.0.1:8000'
export class HomeApiError extends Error {
  readonly uncertain: boolean
  constructor(message: string, uncertain = false) { super(message); this.uncertain = uncertain }
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function overviewWindow(date: string): OverviewWindow {
  const [year, month, day] = date.split('-').map(Number)
  // Construct each local midnight separately, including across daylight-saving changes.
  const midnight = (offset: number) => new Date(year, month - 1, day + offset).toISOString()
  return { today: date, day_start: midnight(0), day_end: midnight(1), upcoming_end: midnight(14), interviews_end: midnight(7) }
}
export function localDateTime(value: string): string {
  const date = new Date(value)
  return `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string'
const nullableText = (v: unknown) => v === null || text(v)
const count = (v: unknown) => Number.isInteger(v) && Number(v) >= 0
const list = (v: unknown, check: (entry: unknown) => boolean) => Array.isArray(v) && v.every(check)
const statuses = ['applied', 'interviewing', 'offer', 'rejected', 'withdrawn']
function task(v: unknown): boolean {
  return record(v) && text(v.task_id) && text(v.title) && nullableText(v.due_on)
    && text(v.created_at) && nullableText(v.completed_at)
}
function event(v: unknown): boolean {
  return record(v) && text(v.event_id) && text(v.title) && ['interview', 'deadline', 'other'].includes(String(v.kind))
    && text(v.starts_at) && nullableText(v.ends_at) && nullableText(v.card_key)
    && typeof v.cancelled === 'boolean' && text(v.created_at)
}
function application(v: unknown): boolean {
  return record(v) && text(v.application_id) && text(v.card_key) && text(v.applied_on)
    && statuses.includes(String(v.status)) && text(v.created_at) && text(v.updated_at)
}
function activity(v: unknown): boolean {
  return record(v) && text(v.event_id) && text(v.occurred_at) && text(v.subject_key) && nullableText(v.card_key)
    && ['card_saved', 'card_updated', 'task_completed', 'application_recorded', 'application_status_changed', 'event_recorded', 'event_adjusted'].includes(String(v.kind))
}
function card(v: unknown): boolean {
  return record(v) && text(v.card_key) && nullableText(v.posting_alias) && record(v.posting)
    && record(v.posting.identity) && record(v.posting.company) && text(v.created_at)
}
function overview(v: unknown): boolean {
  const eventView = (e: unknown) => record(e) && event(e.event) && typeof e.card_missing === 'boolean'
  if (!record(v) || !record(v.today) || !record(v.upcoming) || !record(v.your_search) || !record(v.ai_usage)) return false
  const t = v.today, u = v.upcoming, usage = v.ai_usage
  return list(t.tasks, task) && list(t.completed_tasks, task) && count(t.completed_count) && list(t.events, eventView)
    && list(u.tasks, task) && list(u.events, eventView)
    && ['active', 'awaiting_reply', 'interviews'].every(k => count((v.your_search as Record<string, unknown>)[k]))
    && list(v.applications, a => record(a) && application(a.record) && typeof a.card_missing === 'boolean')
    && list(v.recent_jobs, j => record(j) && card(j.card) && (j.application === null || application(j.application)))
    && list(v.recent_activity, a => record(a) && activity(a.event) && typeof a.card_missing === 'boolean')
    && usage.status === 'not_recorded' && usage.tokens === null && usage.estimated_cost_usd === null
    && list(usage.providers, p => record(p) && text(p.provider_key) && text(p.display_name) && text(p.provider)
      && (p.monthly_budget_usd === null || (typeof p.monthly_budget_usd === 'number' && Number.isFinite(p.monthly_budget_usd) && p.monthly_budget_usd >= 0))
      && ['not_set', 'zero', 'set'].includes(String(p.budget_status)))
}
async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH', validate: (v: unknown) => boolean, body?: object): Promise<T> {
  const writing = method !== 'GET'
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/home${path}`, { method, ...(body ? {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    } : {}) })
  } catch {
    throw new HomeApiError(writing ? 'Save outcome unknown. Refresh to check saved records before retrying.' : 'Home could not be loaded. Please retry.', writing)
  }
  if (!response.ok) {
    // Fixed messages only: never echo backend bodies or record contents.
    if (response.status === 422) throw new HomeApiError('Check the title, dates and selected job. Your draft is still here.')
    if (response.status === 404) throw new HomeApiError('This record or job is no longer available. Refresh to check your records.')
    if (response.status === 409) throw new HomeApiError('This job already has an application, or the record ID is in use. Refresh Home to check; this request was rejected.')
    if (response.status === 503) throw new HomeApiError(writing ? 'Local storage could not save this change. Your draft is still here. Please retry.' : 'Local storage is unavailable. Please retry.')
    throw new HomeApiError(writing ? 'Save could not be confirmed. Refresh to check saved records before retrying.' : 'Local storage is unavailable. Please retry.', writing)
  }
  const value: unknown = await response.json().catch(() => undefined)
  if (!validate(value)) throw new HomeApiError(writing ? 'Save response could not be read. Refresh to check saved records before retrying.' : 'Home returned unreadable data. Please retry.', writing)
  return value as T
}
export const getHomeOverview = (window: OverviewWindow) => request<HomeOverview>(`/overview?${new URLSearchParams(window)}`, 'GET', overview)
export const getHomeActivity = (year: number) => request<HomeActivityData>(`/activity?${new URLSearchParams({
  from: new Date(year, 0, 1).toISOString(), to: new Date(year + 1, 0, 1).toISOString(),
})}`, 'GET', v => record(v) && list(v.events, activity) && nullableText(v.recording_started_at))
export const createTask = (body: CreateTaskRequest) => request<Task>('/tasks', 'POST', task, body)
export const completeTask = (id: string) => request<Task>(`/tasks/${encodeURIComponent(id)}/complete`, 'POST', task)
export const reopenTask = (id: string) => request<Task>(`/tasks/${encodeURIComponent(id)}/reopen`, 'POST', task)
export const createEvent = (body: CreateEventRequest) => request<ScheduleEvent>('/events', 'POST', event, body)
export const adjustEvent = (id: string, body: AdjustEventRequest) => request<ScheduleEvent>(`/events/${encodeURIComponent(id)}`, 'PATCH', event, body)
export const createApplication = (body: CreateApplicationRequest) => request<ApplicationRecord>('/applications', 'POST', application, body)
export const changeApplication = (id: string, status: ApplicationStatus) => request<ApplicationRecord>(`/applications/${encodeURIComponent(id)}`, 'PATCH', application, { status })
export async function getApplicationJobs(): Promise<PostingCard[]> {
  try { return await listPostingCards() } catch { throw new HomeApiError('Saved jobs could not be loaded. Please retry.') }
}
