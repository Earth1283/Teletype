import { Component, type ErrorInfo, type ReactNode } from 'react'
import { withTranslation, type WithTranslation } from 'react-i18next'

interface Props extends WithTranslation {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

class ErrorBoundaryBase extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    const { t } = this.props
    if (error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠</div>
          <div className="error-boundary-title">
            {this.props.label ?? t('errors:genericTitle')}
          </div>
          <div className="error-boundary-detail">{error.message}</div>
          <button className="btn-ghost btn-sm" onClick={this.reset} style={{ marginTop: 8 }}>
            {t('errors:reloadTab')}
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export const ErrorBoundary = withTranslation('errors')(ErrorBoundaryBase)
