import type { PostingDetails } from './postingDetails'

export type CreatePostingCardRequest = {
  import_key: string
  posting: PostingDetails
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}

export type PostingCard = {
  card_key: string
  import_key: string
  schema_version: number
  created_at: string
  posting: PostingDetails
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}

export type UpdatePostingCardRequest = {
  role_summary: string | null
  responsibilities: string[]
  role_domains: string[]
  weekly_hours_minimum: number | null
  weekly_hours_maximum: number | null
  schedule: string | null
  travel_requirement: string | null
  start_on: string | null
  duration: string | null
  benefits: string[]
  vacation_days: number | null
  required_documents: string[]
  special_instructions: string[]
  contact_name: string | null
  contact_role: string | null
  contact_email: string | null
  contact_phone: string | null
  company_summary: string | null
  industry_tags: string[]
  employee_range: string | null
  posting_alias: string | null
  user_notes: string | null
  tags: string[]
}
