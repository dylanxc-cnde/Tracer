import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/pt-serif/400.css'
import '@fontsource/pt-serif/400-italic.css'
import '@fontsource/pt-serif/700.css'
import '@fontsource/pt-serif/700-italic.css'
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
