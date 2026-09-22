import { useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import './PostingCardJobDetails.css'
import type {
  ContractType,
  InternshipRequirement,
  PostingDetails,
  RoleFamily,
  Seniority,
  WorkloadType,
  WorkMode,
} from '../../../../postings/types/postingDetails'
import { formatEnumValue } from '../PostingCardFormatters'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { JobDetailsDraft, TextItemDraft } from '../editor/PostingCardDraft'

const WORKLOAD_TYPES: { key: WorkloadType; label: string }[] = [
  { key: 'full_time', label: 'Full Time' },
  { key: 'part_time', label: 'Part Time' },
  { key: 'either', label: 'Full time / Part time' },
  { key: 'other', label: 'Other' },
]

const ROLE_FAMILIES: { key: RoleFamily; label: string }[] = [
  { key: 'internship', label: 'Internship' },
  { key: 'working_student', label: 'Working Student' },
  { key: 'student_assistant', label: 'Student Assistant' },
  { key: 'thesis', label: 'Thesis' },
  { key: 'regular_employment', label: 'Regular Employment' },
  { key: 'apprenticeship', label: 'Apprenticeship' },
  { key: 'graduate', label: 'Graduate' },
  { key: 'other', label: 'Other' },
]

const CONTRACT_TYPES: { key: ContractType; label: string }[] = [
  { key: 'permanent', label: 'Permanent' },
  { key: 'fixed_term', label: 'Fixed Term' },
  { key: 'temporary', label: 'Temporary' },
  { key: 'freelance', label: 'Freelance' },
  { key: 'other', label: 'Other' },
]

const SENIORITIES: { key: Seniority; label: string }[] = [
  { key: 'student', label: 'Student' },
  { key: 'entry', label: 'Entry' },
  { key: 'experienced', label: 'Experienced' },
  { key: 'lead', label: 'Lead' },
  { key: 'other', label: 'Other' },
]

const WORK_MODES: { key: WorkMode; label: string }[] = [
  { key: 'onsite', label: 'Onsite' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'remote', label: 'Remote' },
  { key: 'field_based', label: 'Field Based' },
  { key: 'other', label: 'Other' },
]

const INTERNSHIP_REQUIREMENTS: { key: InternshipRequirement; label: string }[] = [
  { key: 'mandatory', label: 'Mandatory' },
  { key: 'voluntary', label: 'Voluntary' },
  { key: 'either', label: 'Mandatory / Voluntary' },
  { key: 'not_applicable', label: 'Not Applicable' },
]

type PostingCardJobDetailsProps = {
  posting: PostingDetails
  draft: JobDetailsDraft
  isEditing: boolean
  isSavingCardChanges: boolean
  onChange: (draft: JobDetailsDraft) => void
  onAddressCandidateAdd: () => void
  onAddressCandidateChange: (id: string, value: string) => void
  onAddressCandidateDelete: (id: string) => void
}

type JobDetailFieldProps = {
  label: string
  value: string | null
  isFullWidth?: boolean
  children?: ReactNode
}

function JobDetailField({ label, value, isFullWidth = false, children }: JobDetailFieldProps) {
  return (
    <div className={`posting-card-job-details__field${isFullWidth ? ' posting-card-job-details__field--full-width' : ''}`}>
      <dt>{label}</dt>
      <dd className={!children && !value ? 'posting-card-job-details__empty' : undefined}>
        {children || value || 'None'}
      </dd>
    </div>
  )
}

type JobDetailChoiceProps = {
  label: string
  value: string | null
  options: readonly { key: string; label: string }[]
  isDisabled: boolean
  onChange: (value: string | null) => void
}

function JobDetailChoice({ label, value, options, isDisabled, onChange }: JobDetailChoiceProps) {
  const selectedOption = options.find((option) => option.key === value)
  return (
    <div className="posting-card-job-details__editor">
      <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
        {selectedOption?.label ?? 'None'}
      </span>
      <select
        className="posting-card-job-details__select"
        aria-label={label}
        value={value ?? ''}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">None</option>
        {options.map((option) => (
          <option value={option.key} key={option.key}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

type JobDetailSelectionProps = {
  label: string
  value: string
  isDisabled: boolean
  children: ReactNode
}

// Same local open/close behavior as Application's channel checklist.
function JobDetailSelection({ label, value, isDisabled, children }: JobDetailSelectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionsId = useId()

  return (
    <div
      className="posting-card-job-details__editor"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false)
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault()
          event.stopPropagation()
          setIsOpen(false)
          buttonRef.current?.focus({ preventScroll: true })
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="posting-card-job-details__selection-trigger"
        aria-label={`Choose ${label.toLowerCase()}`}
        aria-expanded={isOpen && !isDisabled}
        aria-controls={optionsId}
        disabled={isDisabled}
        onClick={() => setIsOpen((current) => !current)}
      >
        {value || 'None'}
      </button>
      {isOpen && !isDisabled && (
        <div
          id={optionsId}
          className="posting-card-job-details__options"
          role="group"
          aria-label={`${label} (select all that apply)`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

type JobDetailAddressCandidatesProps = {
  addresses: string[]
  draft: TextItemDraft[]
  isEditing: boolean
  isSavingCardChanges: boolean
  onAdd: () => void
  onChange: (id: string, value: string) => void
  onDelete: (id: string) => void
}

function JobDetailAddressCandidates({
  addresses,
  draft,
  isEditing,
  isSavingCardChanges,
  onAdd,
  onChange,
  onDelete,
}: JobDetailAddressCandidatesProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const isEmpty = isEditing ? draft.length === 0 : addresses.length === 0

  function handleDeleteAddress() {
    if (pendingDeleteId === null || isSavingCardChanges) {
      return
    }
    onDelete(pendingDeleteId)
    setPendingDeleteId(null)
  }

  return (
    <div className="posting-card-job-details__field--full-width posting-card-job-details__address-candidates">
      <dt className="posting-card-job-details__address-heading">
        Other address candidates
        {isEditing && (
          <button
            className="posting-card-job-details__add-address button--primary"
            type="button"
            aria-label="Add address candidate"
            title="Add address candidate"
            disabled={isSavingCardChanges}
            onClick={onAdd}
          >
            +
          </button>
        )}
      </dt>
      <dd>
        {isEmpty ? (
          <span className="posting-card-job-details__empty">None</span>
        ) : (
          <ul className="posting-card-job-details__address-list" role="list">
            {isEditing ? draft.map((address, index) => (
              <li key={address.id}>
                <div className="posting-card-job-details__address-row">
                  <div className="posting-card-job-details__editor">
                    <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
                      {address.value || 'Address'}
                    </span>
                    <textarea
                      className="posting-card-job-details__input"
                      aria-label={`Address candidate ${index + 1}`}
                      value={address.value}
                      placeholder="Address"
                      disabled={isSavingCardChanges}
                      onChange={(event) => onChange(address.id, event.target.value)}
                    />
                  </div>
                  <button
                    className="posting-card-job-details__delete-address"
                    type="button"
                    aria-label={`Delete address candidate ${index + 1}`}
                    title="Delete address candidate"
                    aria-expanded={pendingDeleteId === address.id}
                    disabled={isSavingCardChanges}
                    onClick={() => setPendingDeleteId(address.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                {pendingDeleteId === address.id && (
                  <div className="posting-card-job-details__address-confirmation">
                    <PostingCardDeleteConfirmation
                      message="Delete this address candidate?"
                      isDisabled={isSavingCardChanges}
                      onCancel={() => setPendingDeleteId(null)}
                      onConfirm={handleDeleteAddress}
                    />
                  </div>
                )}
              </li>
            )) : addresses.map((address, index) => (
              <li key={index}>
                <div className="posting-card-job-details__address-row">
                  <span className="posting-card-job-details__value">{address}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </dd>
    </div>
  )
}

export function PostingCardJobDetails({
  posting,
  draft,
  isEditing,
  isSavingCardChanges,
  onChange,
  onAddressCandidateAdd,
  onAddressCandidateChange,
  onAddressCandidateDelete,
}: PostingCardJobDetailsProps) {
  const identity = posting.identity
  const classification = posting.classification
  const workConditions = posting.work_conditions
  const workloadType = classification.workload_type?.value ?? null
  const internshipRequirement = classification.internship_requirement?.value ?? null

  let workload: string | null = null
  if (workloadType !== null) {
    workload = workloadType === 'either'
      ? 'Full time / Part time'
      : formatEnumValue(workloadType)
  }

  let internship: string | null = null
  if (internshipRequirement !== null) {
    internship = internshipRequirement === 'either'
      ? 'Mandatory / Voluntary'
      : formatEnumValue(internshipRequirement)
  }

  function handleRoleFamilyChange(roleFamily: RoleFamily, isSelected: boolean) {
    if (isSavingCardChanges) {
      return
    }
    const roleFamilies = draft.roleFamilies.filter((value) => value !== roleFamily)
    if (isSelected) {
      roleFamilies.push(roleFamily)
    }
    onChange({ ...draft, roleFamilies })
  }

  function handleWorkModeChange(workMode: WorkMode, isSelected: boolean) {
    if (isSavingCardChanges) {
      return
    }
    const workModes = draft.workModes.filter((value) => value !== workMode)
    if (isSelected) {
      workModes.push(workMode)
    }
    onChange({ ...draft, workModes })
  }

  return (
    <dl className="posting-card-job-details">
      <JobDetailField
        label="Position title"
        value={identity.position_title?.value ?? null}
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.positionTitle || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Position title"
              value={draft.positionTitle}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, positionTitle: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
      <JobDetailField
        label="Company name"
        value={identity.company_name?.value ?? null}
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.companyName || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Company name"
              value={draft.companyName}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, companyName: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
      <JobDetailField
        label="Department"
        value={identity.department_name?.value ?? null}
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.departmentName || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Department"
              value={draft.departmentName}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, departmentName: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
      <JobDetailField
        label="Job ID"
        value={identity.external_job_id?.value ?? null}
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.externalJobId || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Job ID"
              value={draft.externalJobId}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, externalJobId: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
      <JobDetailField
        label="Workload"
        value={workload}
      >
        {isEditing && (
          <JobDetailChoice
            label="Workload"
            value={draft.workloadType}
            options={WORKLOAD_TYPES}
            isDisabled={isSavingCardChanges}
            onChange={(value) => onChange({ ...draft, workloadType: value as WorkloadType | null })}
          />
        )}
      </JobDetailField>
      <JobDetailField
        label="Job type"
        value={classification.role_families?.value.map(formatEnumValue).join(' · ') ?? null}
      >
        {isEditing && (
          <JobDetailSelection
            label="Job type"
            value={draft.roleFamilies.map(formatEnumValue).join(' · ')}
            isDisabled={isSavingCardChanges}
          >
            {ROLE_FAMILIES.map((option) => (
              <label className="posting-card-job-details__option" key={option.key}>
                <input
                  type="checkbox"
                  checked={draft.roleFamilies.includes(option.key)}
                  disabled={isSavingCardChanges}
                  onChange={(event) => handleRoleFamilyChange(option.key, event.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </JobDetailSelection>
        )}
      </JobDetailField>
      <JobDetailField
        label="Contract type"
        value={classification.contract_type === null
          ? null
          : formatEnumValue(classification.contract_type.value)}
      >
        {isEditing && (
          <JobDetailChoice
            label="Contract type"
            value={draft.contractType}
            options={CONTRACT_TYPES}
            isDisabled={isSavingCardChanges}
            onChange={(value) => onChange({ ...draft, contractType: value as ContractType | null })}
          />
        )}
      </JobDetailField>
      <JobDetailField
        label="Seniority"
        value={classification.seniority === null
          ? null
          : formatEnumValue(classification.seniority.value)}
      >
        {isEditing && (
          <JobDetailChoice
            label="Seniority"
            value={draft.seniority}
            options={SENIORITIES}
            isDisabled={isSavingCardChanges}
            onChange={(value) => onChange({ ...draft, seniority: value as Seniority | null })}
          />
        )}
      </JobDetailField>
      <JobDetailField
        label="Work mode"
        value={workConditions.work_modes?.value.map(formatEnumValue).join(' · ') ?? null}
      >
        {isEditing && (
          <JobDetailSelection
            label="Work mode"
            value={draft.workModes.map(formatEnumValue).join(' · ')}
            isDisabled={isSavingCardChanges}
          >
            {WORK_MODES.map((option) => (
              <label className="posting-card-job-details__option" key={option.key}>
                <input
                  type="checkbox"
                  checked={draft.workModes.includes(option.key)}
                  disabled={isSavingCardChanges}
                  onChange={(event) => handleWorkModeChange(option.key, event.target.checked)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </JobDetailSelection>
        )}
      </JobDetailField>

      <JobDetailField
        label="Primary address"
        value={workConditions.primary_address?.value ?? null}
        isFullWidth
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.primaryAddress || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Primary address"
              value={draft.primaryAddress}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, primaryAddress: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
      <JobDetailAddressCandidates
        addresses={workConditions.address_candidates}
        draft={draft.addressCandidates}
        isEditing={isEditing}
        isSavingCardChanges={isSavingCardChanges}
        onAdd={onAddressCandidateAdd}
        onChange={onAddressCandidateChange}
        onDelete={onAddressCandidateDelete}
      />

      <JobDetailField
        label="Internship requirement"
        value={internship}
      >
        {isEditing && (
          <JobDetailChoice
            label="Internship requirement"
            value={draft.internshipRequirement}
            options={INTERNSHIP_REQUIREMENTS}
            isDisabled={isSavingCardChanges}
            onChange={(value) => onChange({ ...draft, internshipRequirement: value as InternshipRequirement | null })}
          />
        )}
      </JobDetailField>
      <JobDetailField
        label="Eligibility"
        value={classification.eligibility?.value ?? null}
        isFullWidth
      >
        {isEditing && (
          <div className="posting-card-job-details__editor">
            <span className="posting-card-job-details__value posting-card-job-details__sizing" aria-hidden="true">
              {draft.eligibility || 'None'}
            </span>
            <textarea
              className="posting-card-job-details__input"
              aria-label="Eligibility"
              value={draft.eligibility}
              placeholder="None"
              disabled={isSavingCardChanges}
              onChange={(event) => onChange({ ...draft, eligibility: event.target.value })}
            />
          </div>
        )}
      </JobDetailField>
    </dl>
  )
}
