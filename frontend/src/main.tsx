import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/app/layout/AppShell'
import { TooltipProvider } from '@/shared/ui/Tooltip'
import '@/styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <AppShell />
    </TooltipProvider>
  </StrictMode>,
)
