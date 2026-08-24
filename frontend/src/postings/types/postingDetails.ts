export type PostingSource = {
  excerpts: string[]
  source_urls: string[]
}

export type FactOrigin = 'source' | 'user_defined'

export type ParsedValue<ValueType> = {
  value: ValueType
  origin: FactOrigin
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

export type RequirementItemRule = 'all_of' | 'any_of' | 'unknown'

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
  source: PostingSource
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
  source: PostingSource
  industry_tags: ParsedValue<string>[]
  employee_range: ParsedValue<string> | null
  company_summary: ParsedValue<string> | null
}

export type PostingClassification = {
  source: PostingSource
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
  origin: FactOrigin
  city: string | null
  region: string | null
  country: string | null
}

export type WeeklyHours = {
  origin: FactOrigin
  minimum: number | null
  maximum: number | null
}

export type WorkConditions = {
  source: PostingSource
  locations: PostingLocation[]
  work_modes: ParsedValue<WorkMode[]> | null
  weekly_hours: WeeklyHours | null
  schedule: ParsedValue<string> | null
  travel_requirement: ParsedValue<string> | null
  start_on: ParsedValue<string> | null
  duration: ParsedValue<string> | null
}

export type RoleDescription = {
  source: PostingSource
  role_summary: ParsedValue<string> | null
  responsibilities: ParsedValue<string>[]
  domains: ParsedValue<string>[]
}

export type RequirementItem = {
  name: string
  category: RequirementCategory
  is_example: boolean
}

export type Requirement = {
  origin: FactOrigin
  importance: RequirementImportance
  item_rule: RequirementItemRule
  items: RequirementItem[]
}

export type PostingRequirements = {
  source: PostingSource
  groups: Requirement[]
}

export type CompensationEntry = {
  origin: FactOrigin
  compensation_type: CompensationType
  minimum_amount: number | null
  maximum_amount: number | null
  currency: string | null
  period: CompensationPeriod | null
  pay_basis: PayBasis
  applicable_groups: string[]
  payment_conditions: string | null
}

export type Compensation = {
  source: PostingSource
  entries: CompensationEntry[]
  benefits: ParsedValue<string>[]
  vacation_days: ParsedValue<number> | null
}

export type ApplicationInstructions = {
  source: PostingSource
  channels: ParsedValue<ApplicationChannel[]> | null
  application_url: ParsedValue<string> | null
  required_email_subject: ParsedValue<string> | null
  required_documents: ParsedValue<string>[]
  special_instructions: ParsedValue<string>[]
  application_deadline: ParsedValue<string> | null
}

export type PostingContact = {
  source: PostingSource
  name: string | null
  role: string | null
  email: string | null
  phone: string | null
  origin: FactOrigin
}

export type PostingDetails = {
  identity: PostingIdentity
  company: CompanyInfo
  classification: PostingClassification
  work_conditions: WorkConditions
  role_content: RoleDescription
  requirements: PostingRequirements
  compensation: Compensation
  application_instructions: ApplicationInstructions
  contact: PostingContact | null
}
