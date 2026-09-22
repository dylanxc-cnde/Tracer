import type {
  UpdateCompensationEntryRequest,
  UpdateRequirementGroupRequest,
} from '../../../../postings/types/postingCard'
import type { Requirement } from '../../../../postings/types/postingDetails'
import { formatRequirementItemRuleLabel } from '../PostingCardFormatters'

// Return the first save-time problem, or null; the caller decides how to show it.
export function getRequirementValidationError(
  groups: UpdateRequirementGroupRequest[],
  savedGroups: Requirement[],
): string | null {
  const importanceLabels = { required: 'Required', preferred: 'Nice to have', unknown: 'Unknown' }

  for (const group of groups) {
    // Compare with the current saved card, not original; leave untouched legacy groups alone.
    const isUnchanged = savedGroups.some((saved) => {
      if (
        saved.importance !== group.importance || saved.item_rule !== group.item_rule ||
        saved.items.length !== group.items.length
      ) {
        return false
      }
      return group.items.every((item, itemIndex) => {
        const savedItem = saved.items[itemIndex]
        return item.name === savedItem.name && item.category === savedItem.category &&
          item.is_example === savedItem.is_example
      })
    })
    if (isUnchanged) {
      continue
    }

    // The request has already dropped blank pills; examples don't count as core items.
    const coreCount = group.items.filter((item) => !item.is_example).length
    // Include the lane and item names so the user can find the box that needs fixing.
    const label = `${importanceLabels[group.importance]} — ${formatRequirementItemRuleLabel(group.item_rule)}`
    const preview = group.items.map((item) => item.name).join(', ')
    // Check known AND/OR rules only; don't guess a rule for unknown groups.
    if (group.item_rule === 'any_of' && coreCount < 2) {
      return `${label} (${preview}): keep at least two core items. Examples do not count.`
    }
    if (group.item_rule === 'all_of' && coreCount === 0) {
      return `${label} (${preview}): keep at least one core item. Examples do not count.`
    }
  }
  return null
}

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
