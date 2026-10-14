import type {
  AIProviderSettings,
  AITaskSettings,
  AppSettings,
  CreateAIProviderRequest,
  ReplaceAIProviderKeyRequest,
  UpdateAIProviderRequest,
  UpdatePostingParseSettingsRequest,
  UpdateUserSettingsRequest,
} from '../types/appSettings'

const API_BASE_URL = 'http://127.0.0.1:8000'

export async function getSettings(): Promise<AppSettings> {
  try {
    const response = await fetch(`${API_BASE_URL}/settings`, { method: 'GET' })
    if (!response.ok) throw new Error('Settings unavailable')
    const settings: unknown = await response.json()
    if (!isRecord(settings) || !isRecord(settings.user) || !isRecord(settings.ai)
      || !(settings.user.display_name === null || typeof settings.user.display_name === 'string')
      || !Array.isArray(settings.ai.providers) || !settings.ai.providers.every(isProvider)
      || !Array.isArray(settings.ai.tasks) || !settings.ai.tasks.every(isTask)) {
      throw new Error('Invalid settings response')
    }
    return settings as AppSettings
  } catch {
    throw new Error('Could not load valid settings. Please try again.')
  }
}

export async function updateUserSettings(
  request: UpdateUserSettingsRequest,
): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/user`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (response.status === 422) {
    throw new Error('The display name is invalid. Please check your entry.')
  }

  if (!response.ok) {
    throw new Error(`Failed to save user settings (${response.status}). Please try again.`)
  }

  return (await response.json()) as AppSettings
}

export async function createAIProvider(
  request: CreateAIProviderRequest,
): Promise<AIProviderSettings> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/settings/ai/providers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    // A lost response does not mean that the backend failed to save.
    throw new Error('Could not confirm provider creation. Check your providers before retrying.')
  }

  if (response.status === 422) {
    throw new Error('The provider settings are invalid. Please check your entries.')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null) as {
      detail?: { code?: unknown }
    } | null
    // Only interpret known codes; never display a raw secret-bearing response.
    switch (error?.detail?.code) {
      case 'settings.ai_provider_cleanup_error':
        throw new Error('Provider creation failed. An API key may remain in system credential storage; cleanup could not be confirmed.')
      case 'settings.ai_provider_creation_error':
        throw new Error('Could not save the provider. No new API key was retained.')
      case 'settings.ai_provider_settings_error':
        throw new Error('Could not read valid saved settings. No provider was created.')
      default:
        throw new Error(`Could not confirm provider creation (${response.status}). Check your providers before retrying.`)
    }
  }

  try {
    return (await response.json()) as AIProviderSettings
  } catch {
    throw new Error('Could not read the creation response. Check your providers before retrying.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProvider(value: unknown): value is AIProviderSettings {
  return isRecord(value) && !('api_key' in value)
    && typeof value.provider_key === 'string' && value.provider_key.trim() !== ''
    && (value.provider === 'openai' || value.provider === 'deepseek')
    && typeof value.display_name === 'string' && value.display_name.trim() !== ''
    && (value.monthly_budget_usd === null || (typeof value.monthly_budget_usd === 'number'
      && Number.isFinite(value.monthly_budget_usd) && value.monthly_budget_usd >= 0))
}

function isTask(value: unknown): value is AITaskSettings {
  return isRecord(value) && !('api_key' in value)
    && typeof value.task === 'string' && value.task.trim() !== ''
    && typeof value.provider_key === 'string' && value.provider_key.trim() !== ''
    && typeof value.model === 'string' && value.model.trim() !== ''
}

const UNCONFIRMED_CHANGE = 'Could not confirm the settings change. Refresh Settings before trying again.'

async function writeAISettings(path: string, method: string, body?: object): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/settings/ai/${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }),
    })
  } catch {
    // Never retry a write whose response may simply have been lost.
    throw new Error(UNCONFIRMED_CHANGE)
  }
  if (response.ok) return response
  if (response.status === 404) throw new Error('This provider no longer exists. Refresh Settings before trying again.')
  if (response.status === 409) throw new Error('This provider is used by a task. Clear its selection before deleting it.')
  // Validation may be a fixed string or an application-owned detail object.
  if (response.status === 422) throw new Error('These AI settings are invalid or unsupported. Please check your entries.')
  const error: unknown = await response.json().catch(() => null)
  const code = isRecord(error) && isRecord(error.detail) ? error.detail.code : null
  switch (code) {
    case 'settings.ai_operation_failed':
      throw new Error('The operation failed. Review your settings before trying again.')
    case 'settings.ai_credential_state_uncertain':
      throw new Error('The operation failed and the API key state could not be confirmed. Review system credential storage and refresh Settings before retrying.')
    case 'settings.ai_settings_state_uncertain':
      throw new Error('The operation failed. Credentials were restored, but settings could not be verified. Refresh Settings before retrying.')
    default:
      throw new Error(UNCONFIRMED_CHANGE)
  }
}

export async function updateAIProvider(
  providerKey: string, request: UpdateAIProviderRequest,
): Promise<AIProviderSettings> {
  const response = await writeAISettings(`providers/${encodeURIComponent(providerKey)}`, 'PATCH', {
    display_name: request.display_name, monthly_budget_usd: request.monthly_budget_usd,
  })
  const provider: unknown = await response.json().catch(() => null)
  if (response.status !== 200 || !isProvider(provider) || provider.provider_key !== providerKey) {
    throw new Error(UNCONFIRMED_CHANGE)
  }
  return provider
}

export async function replaceAIProviderKey(
  providerKey: string, request: ReplaceAIProviderKeyRequest,
): Promise<void> {
  const response = await writeAISettings(`providers/${encodeURIComponent(providerKey)}/api-key`, 'PUT', {
    api_key: request.api_key,
  })
  if (response.status !== 204) throw new Error(UNCONFIRMED_CHANGE)
}

export async function deleteAIProvider(providerKey: string): Promise<void> {
  const response = await writeAISettings(`providers/${encodeURIComponent(providerKey)}`, 'DELETE')
  if (response.status !== 204) throw new Error(UNCONFIRMED_CHANGE)
}

export async function updatePostingParseSettings(
  request: UpdatePostingParseSettingsRequest,
): Promise<AITaskSettings> {
  const response = await writeAISettings('tasks/posting_parse', 'PUT', {
    provider_key: request.provider_key, model: request.model,
  })
  const selection: unknown = await response.json().catch(() => null)
  if (response.status !== 200 || !isTask(selection) || selection.task !== 'posting_parse'
    || selection.provider_key !== request.provider_key) throw new Error(UNCONFIRMED_CHANGE)
  return selection
}

export async function clearPostingParseSettings(): Promise<void> {
  const response = await writeAISettings('tasks/posting_parse', 'DELETE')
  if (response.status !== 204) throw new Error(UNCONFIRMED_CHANGE)
}
