import { useState } from 'react'
import './PostingCardAboutCompany.css'
import { PostingCardDeleteConfirmation } from './PostingCardDeleteConfirmation'
import type { CompanyInfo } from '../../../postings/types/postingDetails'
import type { TextItemDraft } from './usePostingCardEditor'

type PostingCardAboutCompanyProps = {
  company: CompanyInfo
  companySummaryDraft: string
  industryTagsDraft: TextItemDraft[]
  employeeRangeDraft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onCompanySummaryChange: (value: string) => void
  onIndustryAdd: () => void
  onIndustryChange: (id: string, value: string) => void
  onIndustryDelete: (id: string) => void
  onEmployeeRangeChange: (value: string) => void
}

export function PostingCardAboutCompany({
  company,
  companySummaryDraft,
  industryTagsDraft,
  employeeRangeDraft,
  isEditing,
  isSavingCardChanges,
  onCompanySummaryChange,
  onIndustryAdd,
  onIndustryChange,
  onIndustryDelete,
  onEmployeeRangeChange,
}: PostingCardAboutCompanyProps) {
  const [pendingDeleteIndustryId, setPendingDeleteIndustryId] = useState<string | null>(null)
  const pendingDeleteIndustry = industryTagsDraft.find(
    (industry) => industry.id === pendingDeleteIndustryId,
  )

  function handleDeleteIndustry(id: string) {
    if (isSavingCardChanges) {
      return
    }

    onIndustryDelete(id)
    setPendingDeleteIndustryId(null)
  }

  return (
    <div className="posting-card-about-company">
      <div className="posting-card-about-company__text">
        {isEditing ? (
          <>
            <span
              className="posting-card-about-company__value posting-card-about-company__value--sizing"
              aria-hidden="true"
            >
              {companySummaryDraft}
            </span>
            <textarea
              className="posting-card-about-company__input"
              aria-label="Company summary"
              value={companySummaryDraft}
              disabled={isSavingCardChanges}
              placeholder="Add a company summary"
              onChange={(event) => onCompanySummaryChange(event.target.value)}
            />
          </>
        ) : (
          <p
            className={`posting-card-about-company__value${company.company_summary === null ? ' posting-card-details__empty-value' : ''}`}
          >
            {company.company_summary?.value ?? 'None'}
          </p>
        )}
      </div>

      <div className="posting-card-about-company__tag-group">
        <div className="posting-card-about-company__industry-heading">
          <strong>Industries</strong>

          {isEditing && (
            <button
              className="posting-card-about-company__add-industry button--primary"
              type="button"
              aria-label="Add industry"
              title="Add industry"
              disabled={isSavingCardChanges}
              onClick={onIndustryAdd}
            >
              +
            </button>
          )}
        </div>

        {isEditing ? (
          industryTagsDraft.length === 0 ? (
            <p className="posting-card-details__empty-value">None</p>
          ) : (
            <div className="posting-card-about-company__pill-list">
              {industryTagsDraft.map((industry, index) => (
                <span className="posting-card-about-company__pill" key={industry.id}>
                  <span className="posting-card-about-company__industry-text">
                    <span
                      className="posting-card-about-company__pill-value posting-card-about-company__pill-value--sizing"
                      aria-hidden="true"
                    >
                      {industry.value || 'New industry'}
                    </span>
                    <input
                      className="posting-card-about-company__pill-input"
                      type="text"
                      aria-label={`Industry ${index + 1}`}
                      value={industry.value}
                      disabled={isSavingCardChanges}
                      placeholder="New industry"
                      autoFocus={industry.value.length === 0}
                      onChange={(event) => onIndustryChange(industry.id, event.target.value)}
                    />
                  </span>

                  <button
                    className="posting-card-about-company__delete-industry-button"
                    type="button"
                    aria-label={`Delete industry ${index + 1}`}
                    title="Delete industry"
                    aria-expanded={pendingDeleteIndustryId === industry.id}
                    disabled={isSavingCardChanges}
                    onClick={() => setPendingDeleteIndustryId(industry.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}
            </div>
          )
        ) : company.industry_tags.length === 0 ? (
          <p className="posting-card-details__empty-value">None</p>
        ) : (
          <div className="posting-card-about-company__pill-list">
            {company.industry_tags.map((industry, index) => (
              <span
                className="posting-card-about-company__pill"
                key={`${industry.value}-${index}`}
              >
                <span className="posting-card-about-company__industry-text">
                  <span className="posting-card-about-company__pill-value">
                    {industry.value}
                  </span>
                </span>
              </span>
            ))}
          </div>
        )}

        {isEditing && pendingDeleteIndustry !== undefined && (
          <div className="posting-card-about-company__delete-confirmation">
            <PostingCardDeleteConfirmation
              message={`Delete “${pendingDeleteIndustry.value || 'New industry'}”?`}
              isDisabled={isSavingCardChanges}
              onCancel={() => setPendingDeleteIndustryId(null)}
              onConfirm={() => handleDeleteIndustry(pendingDeleteIndustry.id)}
            />
          </div>
        )}
      </div>

      <div className="posting-card-about-company__size">
        <strong>Company size:</strong>

        <div className="posting-card-about-company__text">
          {isEditing ? (
            <>
              <span
                className="posting-card-about-company__value posting-card-about-company__value--sizing"
                aria-hidden="true"
              >
                {employeeRangeDraft}
              </span>
              <textarea
                className="posting-card-about-company__input"
                aria-label="Company size"
                value={employeeRangeDraft}
                disabled={isSavingCardChanges}
                placeholder="Add company size"
                onChange={(event) => onEmployeeRangeChange(event.target.value)}
              />
            </>
          ) : (
            <p
              className={`posting-card-about-company__value${company.employee_range === null ? ' posting-card-details__empty-value' : ''}`}
            >
              {company.employee_range?.value ?? 'None'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
