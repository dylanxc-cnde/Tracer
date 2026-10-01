import { useState } from 'react'
import { IconKey, IconUserCircle } from '@tabler/icons-react'
import { ApiSettings } from '../components/settings/api/ApiSettings'
import { ProfileSettings } from '../components/settings/profile/ProfileSettings'
import './SettingsPage.css'

type SettingsSection = 'profile' | 'api'

export function SettingsPage() {
  const [currentSection, setCurrentSection] = useState<SettingsSection>('profile')

  return (
    <section className="settings-page">
      <aside className="settings-page__sidebar">
        <h1 className="settings-page__title">Settings</h1>
        <nav className="settings-page__navigation" aria-label="Settings sections">
          <button
            className="settings-page__navigation-button"
            type="button"
            aria-current={currentSection === 'profile' ? 'page' : undefined}
            onClick={() => setCurrentSection('profile')}
          >
            <IconUserCircle aria-hidden="true" focusable="false" />
            <span>Profile</span>
          </button>

          <button
            className="settings-page__navigation-button"
            type="button"
            aria-current={currentSection === 'api' ? 'page' : undefined}
            onClick={() => setCurrentSection('api')}
          >
            <IconKey aria-hidden="true" focusable="false" />
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
