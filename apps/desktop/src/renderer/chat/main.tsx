import '@sharescreen/ui/global.css'
import '@sharescreen/ui/surface.css'
import './chat.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startLanguage } from '../shared/i18n'
import { startTheme } from '../shared/theme'
import { Chat } from './Chat'

startTheme()

void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Chat />
    </StrictMode>,
  ),
)
