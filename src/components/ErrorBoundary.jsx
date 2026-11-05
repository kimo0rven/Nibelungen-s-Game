import { Component } from 'react'

// Without this, a render error unmounts the whole app and leaves a blank screen.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="center-fill" style={{ textAlign: 'center', padding: 24 }}>
        <h1>Something went wrong</h1>
        <p className="muted">{String(this.state.error.message || this.state.error)}</p>
        <button className="btn" onClick={() => window.location.reload()}>Reload</button>
      </div>
    )
  }
}
