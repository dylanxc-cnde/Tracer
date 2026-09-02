import './PostingCardAboutCompany.css'
import type { CompanyInfo } from '../../../postings/types/postingDetails'

type PostingCardAboutCompanyProps = {
  company: CompanyInfo
}

export function PostingCardAboutCompany({
  company,
}: PostingCardAboutCompanyProps) {
  return (
    <div className="posting-card-about-company">
      <p
        className={
          company.company_summary === null
            ? 'posting-card-details__empty-value'
            : undefined
        }
      >
        {company.company_summary?.value ?? 'None'}
      </p>

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

      <p>
        <strong>Company size:</strong>{' '}
        <span
          className={
            company.employee_range === null
              ? 'posting-card-details__empty-value'
              : undefined
          }
        >
          {company.employee_range?.value ?? 'None'}
        </span>
      </p>
    </div>
  )
}
