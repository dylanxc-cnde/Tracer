export function postingFixture(importKey, title, importSource) {
  const source = { excerpts: [], source_urls: [] }
  const details = {
    identity: {
      source, company_name: null, department_name: null, position_title: { value: title, origin: 'source' },
      external_job_id: null, canonical_posting_url: null, source_platform: null, published_on: null, posting_language: null,
    },
    company: { source, industry_tags: [], employee_range: null, company_summary: null },
    classification: {
      source, role_families: null, workload_type: null, contract_type: null, seniority: null,
      internship_requirement: null, eligibility: null,
    },
    work_conditions: {
      source, primary_address: null, address_candidates: [], work_modes: null, weekly_hours: null,
      schedule: null, travel_requirement: null, start_on: null, duration: null,
    },
    role_content: { source, role_summary: null, responsibilities: [], domains: [] },
    requirements: { source, groups: [] },
    compensation: { source, entries: [], benefits: [], vacation_days: null },
    application_instructions: {
      source, channels: null, application_url: null, required_email_subject: null,
      required_documents: [], special_instructions: [], application_deadline: null,
    },
    contact: null,
  }
  return { importKey, title, details, importSource }
}
