export type UserSettings = {
  display_name: string | null
}

export type AIProvider = 'openai' | 'deepseek'

export type AIProviderSettings = {
  provider_key: string
  provider: AIProvider
  display_name: string
  monthly_budget_usd: number | null
}

export type AITaskSettings = {
  task: string
  provider_key: string
  model: string
}

export type AISettings = {
  providers: AIProviderSettings[]
  tasks: AITaskSettings[]
}

// The response contains non-secret configuration, never API keys.
export type AppSettings = {
  user: UserSettings
  ai: AISettings
}

export type UpdateUserSettingsRequest = {
  display_name: string | null
}

// Write-only input: the backend assigns the UUID and stores the secret separately.
export type CreateAIProviderRequest = {
  provider: AIProvider
  display_name: string
  monthly_budget_usd?: number | null
  api_key: string
}

export type UpdateAIProviderRequest = {
  display_name: string
  monthly_budget_usd: number | null
}

export type ReplaceAIProviderKeyRequest = {
  api_key: string
}

export type UpdatePostingParseSettingsRequest = {
  provider_key: string
  model: string
}
