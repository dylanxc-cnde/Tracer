import './PostingCardPostingInfo.css'
import type { PostingIdentity } from '../../../postings/types/postingDetails'
import { getSafeHttpUrl } from './PostingCardSanitizers'

type PostingCardPostingInfoProps = {
  identity: PostingIdentity
}

export function PostingCardPostingInfo({
  identity,
}: PostingCardPostingInfoProps) {
  const postingUrl = identity.canonical_posting_url?.value ?? null
  const safePostingUrl = getSafeHttpUrl(postingUrl)

  return (
    <div
      id="posting-card-details-posting-info"
      className="posting-card-posting-info"
    >
      <dl className="posting-card-posting-info__list">
        {postingUrl !== null && (
          <div>
            <dt>Posting URL</dt>
            <dd>
              {safePostingUrl === null ? (
                postingUrl
              ) : (
                <a
                  href={safePostingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {postingUrl}
                </a>
              )}
            </dd>
          </div>
        )}

        {identity.source_platform !== null && (
          <div>
            <dt>Source platform</dt>
            <dd>{identity.source_platform.value}</dd>
          </div>
        )}

        {identity.published_on !== null && (
          <div>
            <dt>Published</dt>
            <dd>{identity.published_on.value}</dd>
          </div>
        )}

        {identity.posting_language !== null && (
          <div>
            <dt>Language</dt>
            <dd>{identity.posting_language.value}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}
