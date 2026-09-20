import type {
  CompensationPeriod,
  CompensationType,
  PayBasis,
  PostingDetails,
} from './postingDetails'

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

export type UpdateCompensationEntryRequest = {
  compensation_type: CompensationType
  minimum_amount: number | null
  maximum_amount: number | null
  currency: string | null
  period: CompensationPeriod | null
  pay_basis: PayBasis
  applicable_groups: string[]
  payment_conditions: string | null
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
  compensation_entries: UpdateCompensationEntryRequest[]
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
