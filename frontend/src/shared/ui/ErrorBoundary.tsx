import { Component, type ReactNode } from 'react'
import { report } from '@/shared/lib/report'

type Props = { children: ReactNode }
type State = { message: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown) {
    report('render', error)
  }

  render() {
    if (this.state.message === null) return this.props.children

    return (
      <div className="grid h-full place-items-center bg-base px-6 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-md font-medium text-text">Nens could not render this window.</p>
          <p className="text-sm text-muted">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-base transition-opacity"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
