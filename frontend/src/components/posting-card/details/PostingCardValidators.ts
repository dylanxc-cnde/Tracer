import type { UpdateCompensationEntryRequest } from '../../../postings/types/postingCard'

export function getCompensationValidationError(
  entries: UpdateCompensationEntryRequest[],
): string | null {
  for (const [index, entry] of entries.entries()) {
    const minimum = entry.minimum_amount
    const maximum = entry.maximum_amount
    const label = `Salary entry ${index + 1}`

    if (
      (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) ||
      (maximum !== null && (!Number.isFinite(maximum) || maximum < 0))
    ) {
      return `${label}: amounts must be non-negative decimal numbers, or empty.`
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      return `${label}: minimum amount must not exceed maximum amount.`
    }
  }
  return null
}

export function hasDuplicateTags(tags: readonly string[]): boolean {
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase())
  const uniqueTags = new Set(normalizedTags)

  return uniqueTags.size !== normalizedTags.length
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) {
    return false
  }

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  return day <= daysPerMonth[month - 1]
}
