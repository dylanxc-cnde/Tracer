import './PostingCardRoleDomains.css'
import type { RoleDescription } from '../../../postings/types/postingDetails'

type PostingCardRoleDomainsProps = {
  domains: RoleDescription['domains']
}

export function PostingCardRoleDomains({
  domains,
}: PostingCardRoleDomainsProps) {
  if (domains.length === 0) {
    return null
  }

  return (
    <div className="posting-card-role-domains">
      <strong>Role domains</strong>

      <div className="posting-card-role-domains__list">
        {domains.map((domain, index) => (
          <span
            className="posting-card-role-domains__pill"
            key={`${domain.value}-${index}`}
          >
            {domain.value}
          </span>
        ))}
      </div>
    </div>
  )
}
