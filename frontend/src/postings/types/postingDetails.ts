export type SourceExcerpt = {
  text: string
  source_url: string | null
}

export type ParsedValue<ValueType> = {
  value: ValueType
  sources: SourceExcerpt[]
}

export type RoleFamily =
  | 'internship'
  | 'working_student'
  | 'student_assistant'
  | 'thesis'
  | 'full_time'
  | 'part_time'
  | 'apprenticeship'
  | 'graduate'
  | 'other'

export type ContractType =
  | 'permanent'
  | 'fixed_term'
  | 'temporary'
  | 'freelance'
  | 'other'

export type Seniority =
  | 'student'
  | 'entry'
  | 'experienced'
  | 'lead'
  | 'other'

export type InternshipRequirement =
  | 'mandatory'
  | 'voluntary'
  | 'either'
  | 'not_applicable'

export type WorkMode =
  | 'onsite'
  | 'hybrid'
  | 'remote'
  | 'field_based'
  | 'other'

export type RequirementImportance =
  | 'required'
  | 'preferred'
  | 'unknown'

export type RequirementCategory =
  | 'skill'
  | 'experience'
  | 'education'
  | 'language'
  | 'certification'
  | 'license'
  | 'other'

export type RequirementItemRule =
  | 'single'
  | 'all_of'
  | 'any_of'
  | 'unknown'

export type CompensationType =
  | 'base_salary'
  | 'bonus'
  | 'allowance'
  | 'other'

export type CompensationPeriod =
  | 'hour'
  | 'week'
  | 'month'
  | 'year'
  | 'one_time'

export type PayBasis =
  | 'gross'
  | 'net'
  | 'unknown'

export type ApplicationChannel =
  | 'portal'
  | 'email'
  | 'postal'
  | 'other'

export type PostingIdentity = {
  company_name: ParsedValue<string> | null
  department_name: ParsedValue<string> | null
  position_title: ParsedValue<string> | null
  external_job_id: ParsedValue<string> | null
  canonical_posting_url: ParsedValue<string> | null
  source_platform: ParsedValue<string> | null
  published_on: ParsedValue<string> | null
  posting_language: ParsedValue<string> | null
}

export type CompanyInfo = {
  industry_tags: ParsedValue<string>[]
  employee_range: ParsedValue<string> | null
  company_summary: ParsedValue<string> | null
}

export type PostingClassification = {
  role_families: ParsedValue<RoleFamily[]> | null
  original_employment_type: ParsedValue<string> | null
  contract_type: ParsedValue<ContractType> | null
  seniority: ParsedValue<Seniority> | null
  internship_requirement: ParsedValue<InternshipRequirement> | null
  eligible_groups: ParsedValue<string[]> | null
  study_fields: ParsedValue<string[]> | null
  student_status_required: ParsedValue<boolean> | null
  target_semester: ParsedValue<string> | null
}

export type PostingLocation = {
  city: string | null
  region: string | null
  country: string | null
  sources: SourceExcerpt[]
}

export type WeeklyHours = {
  minimum: number | null
  maximum: number | null
  sources: SourceExcerpt[]
}

export type WorkConditions = {
  locations: PostingLocation[]
  work_modes: ParsedValue<WorkMode[]> | null
  weekly_hours: WeeklyHours | null
  schedule: ParsedValue<string> | null
  travel_requirement: ParsedValue<string> | null
  start_on: ParsedValue<string> | null
  duration: ParsedValue<string> | null
}

export type RoleDescription = {
  role_summary: ParsedValue<string> | null
  responsibilities: ParsedValue<string>[]
  domains: ParsedValue<string>[]
}

export type RequirementItem = {
  name: string
  category: RequirementCategory
  normalized_name: string | null
  is_example: boolean
}

export type Requirement = {
  text: string
  importance: RequirementImportance
  item_rule: RequirementItemRule
  items: RequirementItem[]
  sources: SourceExcerpt[]
}

export type CompensationEntry = {
  compensation_type: CompensationType
  minimum_amount: number | null
  maximum_amount: number | null
  currency: string | null
  period: CompensationPeriod | null
  pay_basis: PayBasis
  applicable_groups: string[]
  payment_conditions: string | null
  sources: SourceExcerpt[]
}

export type Compensation = {
  entries: CompensationEntry[]
  benefits: ParsedValue<string>[]
  vacation_days: ParsedValue<number> | null
}

export type ApplicationInstructions = {
  channels: ParsedValue<ApplicationChannel[]> | null
  application_url: ParsedValue<string> | null
  required_email_subject: ParsedValue<string> | null
  required_documents: ParsedValue<string>[]
  special_instructions: ParsedValue<string>[]
  application_deadline: ParsedValue<string> | null
}

export type PostingContact = {
  name: string | null
  role: string | null
  email: string | null
  phone: string | null
  sources: SourceExcerpt[]
}

export type PostingDetails = {
  identity: PostingIdentity
  company: CompanyInfo
  classification: PostingClassification
  work_conditions: WorkConditions
  role_content: RoleDescription
  requirements: Requirement[]
  compensation: Compensation
  application_instructions: ApplicationInstructions
  contact: PostingContact | null
}
