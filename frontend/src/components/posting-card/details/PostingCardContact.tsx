import './PostingCardContact.css'
import type { PostingContact } from '../../../postings/types/postingDetails'

type PostingCardContactProps = {
  contact: PostingContact | null
  nameDraft: string
  roleDraft: string
  emailDraft: string
  phoneDraft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onNameChange: (value: string) => void
  onRoleChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPhoneChange: (value: string) => void
}

type ContactFieldProps = {
  label: string
  value: string | null
  draft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onChange: (value: string) => void
}

function ContactField({
  label,
  value,
  draft,
  isEditing,
  isSavingCardChanges,
  onChange,
}: ContactFieldProps) {
  return (
    <div className="posting-card-contact__field">
      <dt>{label}</dt>
      <dd>
        <div className="posting-card-contact__text">
          {isEditing ? (
            <>
              <span
                className="posting-card-contact__value posting-card-contact__value--sizing"
                aria-hidden="true"
              >
                {draft}
              </span>
              <textarea
                className="posting-card-contact__input"
                aria-label={`Contact ${label.toLowerCase()}`}
                value={draft}
                disabled={isSavingCardChanges}
                placeholder="None"
                onChange={(event) => onChange(event.target.value)}
              />
            </>
          ) : (
            <span
              className={`posting-card-contact__value${value === null ? ' posting-card-details__empty-value' : ''}`}
            >
              {value ?? 'None'}
            </span>
          )}
        </div>
      </dd>
    </div>
  )
}

export function PostingCardContact({
  contact,
  nameDraft,
  roleDraft,
  emailDraft,
  phoneDraft,
  isEditing,
  isSavingCardChanges,
  onNameChange,
  onRoleChange,
  onEmailChange,
  onPhoneChange,
}: PostingCardContactProps) {
  return (
    <dl className="posting-card-contact">
      <ContactField
        label="Name"
        value={contact?.name ?? null}
        draft={nameDraft}
        isEditing={isEditing}
        isSavingCardChanges={isSavingCardChanges}
        onChange={onNameChange}
      />
      <ContactField
        label="Role"
        value={contact?.role ?? null}
        draft={roleDraft}
        isEditing={isEditing}
        isSavingCardChanges={isSavingCardChanges}
        onChange={onRoleChange}
      />
      <ContactField
        label="Email"
        value={contact?.email ?? null}
        draft={emailDraft}
        isEditing={isEditing}
        isSavingCardChanges={isSavingCardChanges}
        onChange={onEmailChange}
      />
      <ContactField
        label="Phone"
        value={contact?.phone ?? null}
        draft={phoneDraft}
        isEditing={isEditing}
        isSavingCardChanges={isSavingCardChanges}
        onChange={onPhoneChange}
      />
    </dl>
  )
}
