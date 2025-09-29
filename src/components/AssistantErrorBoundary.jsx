import React from 'react';

export default class AssistantErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('AssistantErrorBoundary caught error:', error, info);
  }

  render() {
    const { hasError, error } = this.state;
    const { fallback } = this.props;
    if (hasError) {
      if (fallback) return fallback;
      return (
        <div className="p-3 rounded-md border border-red-200 bg-red-50 text-red-800 text-sm">
          Something went wrong rendering the assistant response.
          <div className="mt-1 text-xs opacity-75">{String(error)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}



