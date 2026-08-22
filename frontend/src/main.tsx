import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PostingImportSessionProvider } from './postings/context/PostingImportSessionProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostingImportSessionProvider>
      <App />
    </PostingImportSessionProvider>
  </StrictMode>,
)
