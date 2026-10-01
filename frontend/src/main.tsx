import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/400-italic.css'
import '@fontsource/inter/700-italic.css'
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
