import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  label?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
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
    if (error) {
      return (
        <div className="error-boundary">
          <div className="error-boundary-icon">⚠</div>
          <div className="error-boundary-title">
            {this.props.label ?? 'Something went wrong'}
          </div>
          <div className="error-boundary-detail">{error.message}</div>
          <button className="btn-ghost btn-sm" onClick={this.reset} style={{ marginTop: 8 }}>
            Reload tab
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
