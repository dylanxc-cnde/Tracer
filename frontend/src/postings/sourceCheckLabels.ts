import type { PostingSourceCheckResult } from './types/postingCard'

export const postingSourceCheckLabels: Record<PostingSourceCheckResult, string> = {
  listed: 'Still listed',
  not_listed: 'No longer listed',
  unable_to_confirm: 'Could not confirm',
}
