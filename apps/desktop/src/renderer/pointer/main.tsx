import '@sharescreen/ui/global.css'
import './pointer.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { startTheme } from '../shared/theme'
import { Pings } from './Pings'

startTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pings source={(listener) => window.platform.pointer.onPing(listener)} />
  </StrictMode>,
)
