import '@sharescreen/ui/global.css'
import '@sharescreen/ui/surface.css'
import './panel.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startLanguage } from '../shared/i18n'
import { startTheme } from '../shared/theme'
import { Panel } from './Panel'

startTheme()

// O idioma chega antes do primeiro desenho (sem piscar no idioma errado).
void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  ),
)
