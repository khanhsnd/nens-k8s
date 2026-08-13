import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '@/app/layout/AppShell'
import { watchForCrashes } from '@/shared/lib/report'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'
import { TooltipProvider } from '@/shared/ui/Tooltip'
import '@/styles/global.css'

watchForCrashes()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TooltipProvider>
        <AppShell />
      </TooltipProvider>
    </ErrorBoundary>
  </StrictMode>,
)
