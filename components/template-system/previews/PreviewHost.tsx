import React, { Component, type ReactNode } from "react";

/**
 * ErrorBoundary for Preview Components
 * Prevents one broken preview from crashing the entire admin page
 */
class PreviewErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Preview render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='w-full h-full flex items-center justify-center bg-red-50 text-red-600 text-xs p-4'>
          <div className='text-center'>
            <div className='font-semibold mb-1'>Preview Error</div>
            <div className='opacity-75'>Template failed to render</div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * PreviewHost Component
 *
 * Provides safe rendering context for template previews
 * - Error boundary to prevent crashes
 * - Neutral container styling
 * - No TRPC, no data fetching, no server APIs
 */
export function PreviewHost({ children }: { children: ReactNode }) {
  return (
    <PreviewErrorBoundary>
      <div className='min-h-screen bg-white'>{children}</div>
    </PreviewErrorBoundary>
  );
}
