import { useState } from 'react'
import './App.css'
import { CardLibraryPage } from './pages/CardLibraryPage'
import { ImportHistoryPage } from './pages/ImportHistoryPage'
import { PostingImportPage } from './pages/PostingImportPage'

type AppPage =
  | 'posting-import'
  | 'card-library'
  | 'import-history'

function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('posting-import')

  return (
    <main>
      <h1>Tracer</h1>
      <p>Review job postings before saving them.</p>

      <nav aria-label="Main navigation">
        <button
          type="button"
          onClick={() => setCurrentPage('posting-import')}
          disabled={currentPage === 'posting-import'}
        >
          Import posting
        </button>

        <button
          type="button"
          onClick={() => setCurrentPage('card-library')}
          disabled={currentPage === 'card-library'}
        >
          Card library
        </button>

        <button
          type="button"
          onClick={() => setCurrentPage('import-history')}
          disabled={currentPage === 'import-history'}
        >
          Import history
        </button>
      </nav>

      <p>Current page: {currentPage}</p>

      {currentPage === 'posting-import' && <PostingImportPage />}
      {currentPage === 'card-library' && <CardLibraryPage />}
      {currentPage === 'import-history' && <ImportHistoryPage />}
    </main>
  )
}

export default App
