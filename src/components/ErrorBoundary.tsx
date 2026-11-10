import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { logError } from '../lib/logger'
import { Button } from './Button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Top-level error boundary. Catches uncaught render errors in the React tree
 * and renders a friendly recovery UI instead of a blank white page.
 *
 * Logs the error via `logError` so it shows up in the console (and, once a
 * remote logger like Sentry is added, in the dashboard).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }): void {
    logError('ErrorBoundary', error)
    if (errorInfo.componentStack) {
      console.error('Component stack:', errorInfo.componentStack)
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark p-4">
        <div className="bg-bg-card rounded-2xl p-6 md:p-8 max-w-md w-full shadow-card text-center border border-border-hairline">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
          <h1 className="text-xl md:text-2xl font-semibold text-text-primary mb-2">
            發生問題
          </h1>
          <p className="text-text-muted text-sm md:text-base mb-6 leading-relaxed">
            頁面發生非預期錯誤，請重新載入。若問題持續，請在 GitHub 回報。
          </p>
          <Button onClick={this.handleReload} variant="primary" fullWidth>
            重新載入頁面
          </Button>
        </div>
      </div>
    )
  }
}
