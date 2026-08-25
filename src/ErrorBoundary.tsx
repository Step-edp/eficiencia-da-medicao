import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
  fallbackTitle?: string
}

type ErrorBoundaryState = {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section className="home-card">
        <p className="section-tag">Erro</p>
        <h2>{this.props.fallbackTitle ?? 'Não foi possível exibir esta tela'}</h2>
        <p>Recarregue a página ou volte e tente novamente.</p>
        <button
          type="button"
          className="primary-button"
          onClick={() => this.setState({ error: null })}
        >
          Tentar novamente
        </button>
      </section>
    )
  }
}
