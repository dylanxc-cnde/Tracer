import { useState } from 'react'
import { IconClock, IconCompass, IconCopy, IconDownload, IconHistory, IconHome, IconSettings } from '@tabler/icons-react'
import './App.css'
import { ActivityPage } from './pages/ActivityPage'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { HomePage } from './pages/HomePage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { MarketPage } from './pages/MarketPage'
import { PostingImportPage } from './pages/PostingImportPage'
import { SettingsPage } from './pages/SettingsPage'
import { GlobalSearch } from './components/search/GlobalSearch'
import type { HomeCardIntent } from './home/types/home'
import type { PostingCard } from './postings/types/postingCard'

type AppPage =
  | 'home'
  | 'market'
  | 'posting-import'
  | 'card-library'
  | 'activity'
  | 'import-history'
  | 'settings'

type AppLocation = { page: AppPage; homeIntent?: HomeCardIntent }

function App() {
  const [location, setLocation] = useState<AppLocation>({ page: 'posting-import' })
  const currentPage = location.page

  function navigate(page: AppPage) {
    setLocation((current) => current.page === page ? current : { page })
  }

  function handlePlanFollowUp(card: PostingCard) {
    setLocation({ page: 'home', homeIntent: { kind: 'follow-up', card } })
  }

  function handleRecordApplication(card: PostingCard) {
    setLocation({ page: 'home', homeIntent: { kind: 'application', card } })
  }

  return (
    <div className="app-shell">
      <header className="app-shell__topbar">
        <p className="app-shell__brand">Tracer</p>

        <GlobalSearch onGoHome={() => navigate('home')} />

        <div className="app-shell__topbar-meta">
          <span className="app-shell__preview-badge">UI preview</span>
          <span className="app-shell__avatar" role="img" aria-label="Demo profile placeholder">D</span>
        </div>
      </header>

      <nav className="app-shell__navigation" aria-label="Main navigation">
        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('home')}
          aria-current={currentPage === 'home' ? 'page' : undefined}
        >
          <IconHome aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Home</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('market')}
          aria-current={currentPage === 'market' ? 'page' : undefined}
        >
          <IconCompass aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Market</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('card-library')}
          aria-current={currentPage === 'card-library' ? 'page' : undefined}
        >
          <IconCopy aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Card library</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('posting-import')}
          aria-current={currentPage === 'posting-import' ? 'page' : undefined}
        >
          <IconDownload aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Import posting</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('activity')}
          aria-current={currentPage === 'activity' ? 'page' : undefined}
        >
          <IconClock aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Activity</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => navigate('import-history')}
          aria-current={currentPage === 'import-history' ? 'page' : undefined}
        >
          <IconHistory aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Import history</span>
        </button>

        <button
          className="app-shell__navigation-button app-shell__navigation-button--settings"
          type="button"
          onClick={() => navigate('settings')}
          aria-current={currentPage === 'settings' ? 'page' : undefined}
        >
          <IconSettings aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label">Settings</span>
        </button>
      </nav>

      {/* Recreate only the page container so its scroll position starts at the top. */}
      <main key={currentPage} className={`app-shell__content app-shell__content--${currentPage}`}>
        {currentPage === 'home' && <HomePage homeIntent={location.homeIntent} />}
        {currentPage === 'market' && <MarketPage onPlanFollowUp={handlePlanFollowUp} onRecordApplication={handleRecordApplication} />}
        {currentPage === 'posting-import' && <PostingImportPage />}
        {currentPage === 'card-library' && (
          <CardLibraryPage
            onPlanFollowUp={handlePlanFollowUp}
            onRecordApplication={handleRecordApplication}
          />
        )}
        {currentPage === 'activity' && <ActivityPage />}
        {currentPage === 'import-history' && <ImportHistoryPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
