import type { CompensationEntry, PostingDetails, Requirement, RequirementItem, WeeklyHours } from '../../postings/types/postingDetails'

type FactKey<Details> = Exclude<keyof NonNullable<Details>, 'origin' | 'source'>

const suffixes = {
  value: ['', '.value'],
  valueArray: ['', '.value', '.value[]'],
  array: ['', '[]'],
  arrayOfValues: ['', '[]', '[].value'],
} as const

type FieldLabel = string | readonly [label: string, shape: keyof typeof suffixes]
type SectionLabels = {
  [Section in keyof PostingDetails]: {
    label: string
    fields: Record<FactKey<PostingDetails[Section]>, FieldLabel>
  }
}

const sectionLabels = {
  identity: {
    label: 'Posting identity',
    fields: {
      company_name: ['Company name', 'value'],
      department_name: ['Department', 'value'],
      position_title: ['Position title', 'value'],
      external_job_id: ['Job ID', 'value'],
      canonical_posting_url: ['Posting URL', 'value'],
      source_platform: ['Source platform', 'value'],
      published_on: ['Publication date', 'value'],
      posting_language: ['Posting language', 'value'],
    },
  },
  company: {
    label: 'Company information',
    fields: {
      industry_tags: ['Industries', 'arrayOfValues'],
      employee_range: ['Company size', 'value'],
      company_summary: ['Company summary', 'value'],
    },
  },
  classification: {
    label: 'Job classification',
    fields: {
      role_families: ['Job type', 'valueArray'],
      workload_type: ['Workload', 'value'],
      contract_type: ['Contract type', 'value'],
      seniority: ['Seniority', 'value'],
      internship_requirement: ['Internship requirement', 'value'],
      eligibility: ['Eligibility', 'value'],
    },
  },
  work_conditions: {
    label: 'Work conditions',
    fields: {
      primary_address: ['Location', 'value'],
      address_candidates: ['Location', 'array'],
      work_modes: ['Work mode', 'valueArray'],
      weekly_hours: 'Weekly hours',
      schedule: ['Schedule', 'value'],
      travel_requirement: ['Travel requirement', 'value'],
      start_on: ['Start date', 'value'],
      duration: ['Duration', 'value'],
    },
  },
  role_content: {
    label: 'Role and responsibilities',
    fields: {
      role_summary: ['Role summary', 'value'],
      responsibilities: ['Responsibilities', 'arrayOfValues'],
      domains: ['Role domains', 'arrayOfValues'],
    },
  },
  requirements: {
    label: 'Requirements',
    fields: { groups: 'Requirement groups' },
  },
  compensation: {
    label: 'Compensation',
    fields: {
      entries: 'Compensation',
      benefits: ['Benefits', 'arrayOfValues'],
      vacation_days: ['Vacation days', 'value'],
    },
  },
  application_instructions: {
    label: 'Application instructions',
    fields: {
      channels: ['Application channels', 'valueArray'],
      application_url: ['Application URL', 'value'],
      required_email_subject: ['Application email subject', 'value'],
      required_documents: ['Required documents', 'arrayOfValues'],
      special_instructions: ['Special instructions', 'arrayOfValues'],
      application_deadline: ['Application deadline', 'value'],
    },
  },
  contact: {
    label: 'Contact',
    fields: { name: 'Contact name', role: 'Contact role', email: 'Contact email', phone: 'Contact phone' },
  },
} as const satisfies SectionLabels

const weeklyHoursLabels = {
  minimum: 'Minimum weekly hours',
  maximum: 'Maximum weekly hours',
} satisfies Record<FactKey<WeeklyHours>, string>

const requirementGroupLabels = {
  importance: 'Requirement importance',
  item_rule: 'Requirement combination',
  items: 'Requirement items',
} satisfies Record<FactKey<Requirement>, string>

const requirementItemLabels = {
  name: 'Requirement name',
  category: 'Requirement category',
  is_example: 'Requirement example status',
} satisfies Record<FactKey<RequirementItem>, string>

const compensationEntryFields = {
  compensation_type: 'Type',
  minimum_amount: 'Minimum amount',
  maximum_amount: 'Maximum amount',
  currency: 'Currency',
  period: 'Pay period',
  pay_basis: 'Pay basis',
  applicable_groups: 'Applicable groups',
  payment_conditions: 'Payment conditions',
} satisfies Record<FactKey<CompensationEntry>, string>

const fieldLabels = new Map<string, string>([
  ['requirements.groups[]', 'Requirement group'],
  ['requirements.groups[].items[]', 'Requirement item'],
])

for (const [section, { label, fields }] of Object.entries(sectionLabels)) {
  fieldLabels.set(section, label)
  for (const [field, description] of Object.entries<FieldLabel>(fields)) {
    const path = `${section}.${field}`
    if (typeof description === 'string') {
      fieldLabels.set(path, description)
    } else {
      const [fieldLabel, shape] = description
      for (const suffix of suffixes[shape]) fieldLabels.set(path + suffix, fieldLabel)
    }
  }
}

for (const [field, label] of Object.entries(weeklyHoursLabels)) {
  fieldLabels.set(`work_conditions.weekly_hours.${field}`, label)
}
for (const [field, label] of Object.entries(requirementGroupLabels)) {
  fieldLabels.set(`requirements.groups[].${field}`, label)
}
for (const [field, label] of Object.entries(requirementItemLabels)) {
  fieldLabels.set(`requirements.groups[].items[].${field}`, label)
}

const compensationEntryPath = 'compensation.entries[]'
const compensationEntryLabels = new Map<string, string>([
  [compensationEntryPath, ''],
  [`${compensationEntryPath}.applicable_groups[]`, compensationEntryFields.applicable_groups],
])
for (const [field, label] of Object.entries(compensationEntryFields)) {
  compensationEntryLabels.set(`${compensationEntryPath}.${field}`, label)
}

const unknownField = 'Uncertain field'
const fieldPathPattern = /^[a-z_]+(?:\.[a-z_]+|\.(?:0|[1-9]\d*)|\[(?:0|[1-9]\d*)\])*$/
const arrayIndexPattern = /\[(\d+)\]|\.(\d+)/g

export function getAmbiguityFieldLabel(fieldPath: string) {
  if (!fieldPathPattern.test(fieldPath)) return unknownField

  const indices: number[] = []
  const path = fieldPath.replace(arrayIndexPattern, (_match, bracketIndex, dotIndex) => {
    indices.push(Number(bracketIndex ?? dotIndex))
    return '[]'
  })
  if (indices.some(index => !Number.isSafeInteger(index + 1))) return unknownField

  const entryField = compensationEntryLabels.get(path)
  const entryIndex = indices[0]
  if (entryField !== undefined && entryIndex !== undefined) {
    const entry = `Compensation entry ${entryIndex + 1}`
    return entryField ? `${entry} · ${entryField}` : entry
  }

  return fieldLabels.get(path) ?? unknownField
}
