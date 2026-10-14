import type { PostingDetails, RequirementCategory, RequirementImportance, RequirementItemRule } from '../../postings/types/postingDetails'

export type EvidenceKind = 'qualification' | 'skill' | 'language' | 'experience' | 'certificate'
export type ConstraintKind = 'work_type' | 'location' | 'office' | 'hours' | 'salary' | 'availability'
export type MatchStatus = 'met' | 'partial' | 'missing' | 'unknown' | 'not_applicable'
export type EvidenceInput = { evidence_id: string | null; kind: EvidenceKind; label: string; description: string | null }
export type ConstraintInput = { constraint_id: string | null; kind: ConstraintKind; label: string; description: string | null; importance: RequirementImportance }
export type CandidateProfile = { profile_id: string; revision: number; confirmed_at: string; evidence: (EvidenceInput & { evidence_id: string })[] }
export type JobSearchGoal = { goal_id: string; revision: number; confirmed_at: string; objective: string | null; constraints: (ConstraintInput & { constraint_id: string })[] }
export type SaveProfileRequest = { expected_revision: number; evidence: EvidenceInput[] }
export type SaveGoalRequest = { expected_revision: number; objective: string | null; constraints: ConstraintInput[] }
export type MatchInputs = { fingerprint: string; posting_revision: string; profile_revision: number; goal_revision: number; rule_revision: string }
export type EvidenceReference = { kind: 'profile' | 'goal'; entry_id: string }
export type MatchTarget = { target_id: string; label: string; is_example: boolean; posting_available: boolean; constraint_id: string | null; category: RequirementCategory | null }
export type MatchGroup = { group_id: string; dimension: 'qualification' | 'capability' | 'preference'; label: string; importance: RequirementImportance; item_rule: RequirementItemRule; targets: MatchTarget[] }
export type Judgment = { judgment_id: string; target_id: string; status: MatchStatus; reason: string | null; evidence: EvidenceReference[]; confirmed_importance: RequirementImportance | null; confirmed_at: string | null }
export type SaveJudgmentRequest = { expected_inputs: string; expected_revision: number; status: MatchStatus; reason: string | null; evidence: EvidenceReference[]; confirmed_importance: RequirementImportance | null }
export type MatchRecord = {
  match_id: string; card_key: string; version: number; revision: number
  created_at: string; updated_at: string; mode: 'local_review'; inputs: MatchInputs
  posting_snapshot: PostingDetails; profile_snapshot: CandidateProfile | null; goal_snapshot: JobSearchGoal | null
  groups: MatchGroup[]; judgments: Judgment[]
  summary: {
    groups: { group_id: string; dimension: MatchGroup['dimension']; importance: RequirementImportance; status: MatchStatus }[]
    qualification_warnings: string[]; capability_gaps: string[]; preference_conflicts: string[]
    evidence_coverage: { total: number; linked: number; unknown: number; explicitly_not_applicable: number }
  }
}
export type MatchView = { current_inputs: MatchInputs | null; match: MatchRecord | null; stale: boolean; stale_reasons: ('posting' | 'profile' | 'goal' | 'rules' | 'card_missing')[] }

export const statusLabels: Record<MatchStatus, string> = {
  met: 'Met', partial: 'Partially met', missing: 'Confirmed gap', unknown: 'Unknown', not_applicable: 'Not applicable',
}
export const evidenceKinds: EvidenceKind[] = ['qualification', 'skill', 'language', 'experience', 'certificate']
export const constraintKinds: ConstraintKind[] = ['work_type', 'location', 'office', 'hours', 'salary', 'availability']
export const importanceLabels: Record<RequirementImportance, string> = { required: 'Required', preferred: 'Preferred', unknown: 'Priority unknown' }
