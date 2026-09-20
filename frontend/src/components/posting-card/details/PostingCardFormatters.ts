import type {
  CompensationEntry,
  Requirement,
  WeeklyHours,
} from '../../../postings/types/postingDetails'

export function formatEnumValue(value: string) {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatAddressPreview(address: string | null): string | null {
  const text = address?.trim().replace(/\s+/g, ' ') ?? ''
  if (text.length === 0) {
    return null
  }

  // Shorten only the preview; do not try to extract a city from free text.
  return text.length > 80 ? `${text.slice(0, 79)}…` : text
}

export function formatWeeklyHours(weeklyHours: WeeklyHours) {
  const { minimum, maximum } = weeklyHours

  if (minimum !== null && maximum !== null) {
    return minimum === maximum
      ? `${minimum} hours/week`
      : `${minimum}–${maximum} hours/week`
  }

  if (minimum !== null) {
    return `From ${minimum} hours/week`
  }

  if (maximum !== null) {
    return `Up to ${maximum} hours/week`
  }

  return null
}

export function formatCompensationEntry(entry: CompensationEntry) {
  let amount: string

  if (entry.minimum_amount !== null && entry.maximum_amount !== null) {
    amount =
      entry.minimum_amount === entry.maximum_amount
        ? `${entry.minimum_amount}`
        : `${entry.minimum_amount}–${entry.maximum_amount}`
  } else if (entry.minimum_amount !== null) {
    amount = `From ${entry.minimum_amount}`
  } else if (entry.maximum_amount !== null) {
    amount = `Up to ${entry.maximum_amount}`
  } else {
    return null
  }

  let period: string | null = null
  if (entry.period === 'one_time') {
    period = 'one-time'
  } else if (entry.period !== null) {
    period = `per ${entry.period}`
  }

  const compensation = [
    amount,
    entry.currency,
    period,
    entry.pay_basis === 'unknown' ? null : entry.pay_basis,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')

  if (entry.applicable_groups.length === 0) {
    return compensation
  }

  return `${entry.applicable_groups.join(', ')}: ${compensation}`
}

export function formatRequirementItemRuleLabel(
  itemRule: Requirement['item_rule'],
) {
  if (itemRule === 'any_of') {
    return 'Choose any one'
  }

  if (itemRule === 'all_of') {
    return 'All required together'
  }

  return 'Combination unclear'
}

export function formatRequirementItemRuleConnector(
  itemRule: Requirement['item_rule'],
) {
  if (itemRule === 'any_of') {
    return 'OR'
  }

  if (itemRule === 'all_of') {
    return 'AND'
  }

  return null
}
