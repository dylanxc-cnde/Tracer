import type { CompensationEntry } from '../../../postings/types/postingDetails'

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

  const compensation = [
    amount,
    entry.currency,
    entry.period === null ? null : `per ${entry.period}`,
    entry.pay_basis === 'unknown' ? null : entry.pay_basis,
  ]
    .filter((part): part is string => part !== null)
    .join(' ')

  if (entry.applicable_groups.length === 0) {
    return compensation
  }

  return `${entry.applicable_groups.join(', ')}: ${compensation}`
}
