import { useState } from 'react'
import { PersonCropCircle } from 'framework7-icons/react'
import { ApiSettings } from '../components/settings/api/ApiSettings'
import { ProfileSettings } from '../components/settings/profile/ProfileSettings'
import './SettingsPage.css'

type SettingsSection = 'profile' | 'api'

export function SettingsPage() {
  const [currentSection, setCurrentSection] = useState<SettingsSection>('profile')

  return (
    <section className="settings-page">
      <aside className="settings-page__sidebar">
        <h2 className="settings-page__title">Settings</h2>
        <nav className="settings-page__navigation" aria-label="Settings sections">
          <button
            className="settings-page__navigation-button"
            type="button"
            aria-current={currentSection === 'profile' ? 'page' : undefined}
            onClick={() => setCurrentSection('profile')}
          >
            <PersonCropCircle aria-hidden="true" focusable="false" />
            <span>Profile</span>
          </button>

          <button
            className="settings-page__navigation-button"
            type="button"
            aria-current={currentSection === 'api' ? 'page' : undefined}
            onClick={() => setCurrentSection('api')}
          >
            {/* The installed icon set has no key glyph; keep this SVG fallback local. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="7.5" cy="7.5" r="4.5" />
              <path d="M10.7 10.7 21 21M15 15l3-3M18 18l3-3" />
            </svg>
            <span>API</span>
          </button>
        </nav>
      </aside>

      <div
        className="settings-page__workspace"
        role="region"
        aria-labelledby={`settings-${currentSection}-title`}
        tabIndex={0}
      >
        {currentSection === 'profile' && <ProfileSettings />}
        {currentSection === 'api' && <ApiSettings />}
      </div>
    </section>
  )
}
