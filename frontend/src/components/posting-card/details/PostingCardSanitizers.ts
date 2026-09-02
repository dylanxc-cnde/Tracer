export function getSafeHttpUrl(url: string | null) {
  if (url === null) {
    return null
  }

  try {
    const parsedUrl = new URL(url)

    if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
      return parsedUrl.href
    }
  } catch {
    return null
  }

  return null
}
