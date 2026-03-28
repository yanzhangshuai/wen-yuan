"use client";

import { Component, type ReactNode } from "react";

interface AsyncErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface AsyncErrorBoundaryState {
  hasError: boolean;
}

export class AsyncErrorBoundary extends Component<AsyncErrorBoundaryProps, AsyncErrorBoundaryState> {
  override state: AsyncErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): AsyncErrorBoundaryState {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
