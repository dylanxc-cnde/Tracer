import type {
  ApplicationChannel,
  CompensationPeriod,
  CompensationType,
  ContractType,
  InternshipRequirement,
  PayBasis,
  RoleFamily,
  Seniority,
  WorkMode,
  WorkloadType,
} from '../../../../postings/types/postingDetails'

export type TextItemDraft = {
  id: string
  value: string
}

export type JobDetailsDraft = {
  workloadType: WorkloadType | null
  roleFamilies: RoleFamily[]
  contractType: ContractType | null
  seniority: Seniority | null
  workModes: WorkMode[]
  primaryAddress: string
  addressCandidates: TextItemDraft[]
  internshipRequirement: InternshipRequirement | null
  eligibility: string
}

export type WorkConditionsDraft = {
  weeklyHours: { minimum: string; maximum: string } | null
  schedule: string | null
  travelRequirement: string | null
  startOn: string | null
  duration: string | null
}

export type WorkConditionField = keyof WorkConditionsDraft
export type WorkConditionTextField = Exclude<WorkConditionField, 'weeklyHours'>

export type CompensationEntryFields = {
  id: string
  compensationType: CompensationType
  minimumAmount: string
  maximumAmount: string
  currency: string
  period: CompensationPeriod | null
  payBasis: PayBasis
  applicableGroups: TextItemDraft[]
  paymentConditions: string
}

export type ApplicationFactsDraft = {
  channels: ApplicationChannel[]
  applicationUrl: string
  applicationDeadline: string
  requiredEmailSubject: string
}

export type ApplicationTextField = Exclude<keyof ApplicationFactsDraft, 'channels'>

// Type Definition: CardDraft
export type PostingCardUserDraft = {
  roleSummary: string
  responsibilities: TextItemDraft[]
  roleDomains: TextItemDraft[]
  jobDetails: JobDetailsDraft
  workConditions: WorkConditionsDraft
  compensationEntries: CompensationEntryFields[]
  benefits: TextItemDraft[]
  vacationDays: string
  applicationFacts: ApplicationFactsDraft
  requiredDocuments: TextItemDraft[]
  specialInstructions: TextItemDraft[]
  contactName: string
  contactRole: string
  contactEmail: string
  contactPhone: string
  companySummary: string
  industryTags: TextItemDraft[]
  employeeRange: string
  postingAlias: string
  tags: TextItemDraft[]
  userNotes: string
}
