import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-rose text-lg">오류가 발생했습니다</div>
          <p className="text-sm text-text/60 max-w-md">
            {this.state.error.message}
          </p>
          <details className="mt-1 max-w-md text-left text-xs text-text/30">
            <summary className="cursor-pointer hover:text-text/50">상세 정보</summary>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-bg p-2">
              {this.state.error.stack?.slice(0, 500)}
            </pre>
          </details>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 text-sm bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors"
          >
            페이지 새로고침
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
