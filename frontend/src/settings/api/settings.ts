import type { AppSettings, UpdateUserSettingsRequest } from '../types/appSettings'

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
