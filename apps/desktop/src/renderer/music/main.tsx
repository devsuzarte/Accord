import '@sharescreen/ui/global.css'
import './music.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startLanguage } from '../shared/i18n'
import { startTheme } from '../shared/theme'
import { Player } from './Player'

startTheme()

void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Player />
    </StrictMode>,
  ),
)
