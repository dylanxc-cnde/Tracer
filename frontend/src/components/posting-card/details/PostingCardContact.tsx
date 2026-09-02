import './PostingCardContact.css'
import type { PostingContact } from '../../../postings/types/postingDetails'

type PostingCardContactProps = {
  contact: PostingContact | null
}

type ContactFieldProps = {
  label: string
  value: string | null
}

function ContactField({ label, value }: ContactFieldProps) {
  return (
    <div className="posting-card-contact__field">
      <dt>{label}</dt>
      <dd
        className={
          value === null ? 'posting-card-details__empty-value' : undefined
        }
      >
        {value ?? 'None'}
      </dd>
    </div>
  )
}

export function PostingCardContact({ contact }: PostingCardContactProps) {
  return (
    <dl className="posting-card-contact">
      <ContactField label="Name" value={contact?.name ?? null} />
      <ContactField label="Role" value={contact?.role ?? null} />
      <ContactField label="Email" value={contact?.email ?? null} />
      <ContactField label="Phone" value={contact?.phone ?? null} />
    </dl>
  )
}
