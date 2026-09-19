import './PostingCardAboutCompany.css'
import type { CompanyInfo } from '../../../postings/types/postingDetails'

type PostingCardAboutCompanyProps = {
  company: CompanyInfo
  companySummaryDraft: string
  employeeRangeDraft: string
  isEditing: boolean
  isSavingCardChanges: boolean
  onCompanySummaryChange: (value: string) => void
  onEmployeeRangeChange: (value: string) => void
}

export function PostingCardAboutCompany({
  company,
  companySummaryDraft,
  employeeRangeDraft,
  isEditing,
  isSavingCardChanges,
  onCompanySummaryChange,
  onEmployeeRangeChange,
}: PostingCardAboutCompanyProps) {
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
        <strong>Industries</strong>

        {company.industry_tags.length === 0 ? (
          <p className="posting-card-details__empty-value">None</p>
        ) : (
          <div className="posting-card-about-company__pill-list">
            {company.industry_tags.map((industry, index) => (
              <span
                className="posting-card-about-company__pill"
                key={`${industry.value}-${index}`}
              >
                {industry.value}
              </span>
            ))}
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
