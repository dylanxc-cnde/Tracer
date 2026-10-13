import type {
  AIProviderSettings,
  AppSettings,
  CreateAIProviderRequest,
  UpdateUserSettingsRequest,
} from '../types/appSettings'

const API_BASE_URL = 'http://127.0.0.1:8000'

export async function getSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Failed to load settings (${response.status}). Please try again.`)
  }

  return (await response.json()) as AppSettings
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
