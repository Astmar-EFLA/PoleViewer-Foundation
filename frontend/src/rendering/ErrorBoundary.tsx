import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly label: string;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * React error boundaries must be class components (no hook equivalent as
 * of this React version) -- this is the standard, minimal shape. Wraps the
 * 3D scene and each major panel (Phase 9: "malformed input fails visibly")
 * so a bug triggered by one piece of engineering data (e.g. a degenerate
 * geometry from a corrupted or hand-edited project file) shows a visible,
 * scoped error message instead of a blank white screen -- and, critically,
 * does not take the rest of the UI down with it, since every boundary is
 * independent.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error(`[${this.props.label}] render error:`, error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 10,
            borderRadius: 6,
            background: "#fdeaea",
            border: "1px solid #e0a0a0",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            color: "#a01818",
            maxWidth: 320,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{this.props.label} failed to render</div>
          <div style={{ marginBottom: 6, wordBreak: "break-word" }}>{this.state.error.message}</div>
          <button
            onClick={this.handleReset}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
