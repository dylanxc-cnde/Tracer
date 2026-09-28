import { useState } from 'react'
import { Clock, GearAlt, House, HouseFill, SquareStack, TrayArrowDown } from 'framework7-icons/react'
import './App.css'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { HomePage } from './pages/HomePage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { PostingImportPage } from './pages/PostingImportPage'
import { SettingsPage } from './pages/SettingsPage'

type AppPage =
  | 'home'
  | 'posting-import'
  | 'card-library'
  | 'import-history'
  | 'settings'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('posting-import')

  return (
    <div className="app-shell">
      <nav className="app-shell__navigation" aria-label="Main navigation">
        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('home')}
          aria-label="Home"
          aria-current={currentPage === 'home' ? 'page' : undefined}
        >
          {currentPage === 'home'
            ? <HouseFill aria-hidden="true" focusable="false" />
            : <House aria-hidden="true" focusable="false" />}
          <span className="app-shell__navigation-label" aria-hidden="true">Home</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('posting-import')}
          aria-label="Import posting"
          aria-current={currentPage === 'posting-import' ? 'page' : undefined}
        >
          <TrayArrowDown aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label" aria-hidden="true">Import posting</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('card-library')}
          aria-label="Card library"
          aria-current={currentPage === 'card-library' ? 'page' : undefined}
        >
          <SquareStack aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label" aria-hidden="true">Card library</span>
        </button>

        <button
          className="app-shell__navigation-button"
          type="button"
          onClick={() => setCurrentPage('import-history')}
          aria-label="Import history"
          aria-current={currentPage === 'import-history' ? 'page' : undefined}
        >
          <Clock aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label" aria-hidden="true">Import history</span>
        </button>

        <button
          className="app-shell__navigation-button app-shell__navigation-button--settings"
          type="button"
          onClick={() => setCurrentPage('settings')}
          aria-label="Settings"
          aria-current={currentPage === 'settings' ? 'page' : undefined}
        >
          <GearAlt aria-hidden="true" focusable="false" />
          <span className="app-shell__navigation-label" aria-hidden="true">Settings</span>
        </button>
      </nav>

      <main className={currentPage === 'home' ? 'app-shell__content app-shell__content--home' : 'app-shell__content'}>
        <header className="app-shell__header">
          <h1 className="app-shell__brand">Tracer</h1>
          <p className="app-shell__tagline">Your Personal Job Assistant.</p>
        </header>

        {currentPage === 'home' && <HomePage />}
        {currentPage === 'posting-import' && <PostingImportPage />}
        {currentPage === 'card-library' && <CardLibraryPage />}
        {currentPage === 'import-history' && <ImportHistoryPage />}
        {currentPage === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}

export default App
