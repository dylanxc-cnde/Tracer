export function hasDuplicateTags(tags: readonly string[]): boolean {
  const normalizedTags = tags.map((tag) => tag.trim().toLowerCase())
  const uniqueTags = new Set(normalizedTags)

  return uniqueTags.size !== normalizedTags.length
}
