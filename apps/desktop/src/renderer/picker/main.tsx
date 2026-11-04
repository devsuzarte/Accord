import '@sharescreen/ui/global.css'
import './picker.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startLanguage } from '../shared/i18n'
import { startTheme } from '../shared/theme'
import { Picker } from './Picker'

startTheme()

// O idioma chega antes do primeiro desenho (sem piscar no idioma errado).
void startLanguage().then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Picker />
    </StrictMode>,
  ),
)
