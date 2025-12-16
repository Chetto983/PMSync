import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Paper, Alert } from '@mui/material';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ErrorBoundary');

/**
 * Props for ErrorBoundary component
 */
interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Name of the component/page for logging
   */
  name?: string;
  /**
   * Custom fallback UI - if not provided, default error UI is shown
   */
  fallback?: ReactNode;
  /**
   * Callback when error is caught
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /**
   * Whether to show retry button
   * @default true
   */
  showRetry?: boolean;
  /**
   * Whether to show home button
   * @default true
   */
  showHome?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary - Catches React render errors
 *
 * Based on React 18+ error boundary patterns and 2025 best practices:
 * - Catches errors in child component tree
 * - Logs errors with context for debugging
 * - Provides user-friendly fallback UI with retry option
 * - Prevents entire app crash from component errors
 *
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 * @see https://blog.logrocket.com/react-error-handling-with-react-error-boundary/
 *
 * @example
 * ```tsx
 * <ErrorBoundary name="Dashboard">
 *   <Dashboard />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const { name, onError } = this.props;

    // Log error with context
    logger.error(`Error in ${name || 'component'}`, {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Update state with error info
    this.setState({ errorInfo });

    // Call custom error handler if provided
    onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = (): void => {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, name, showRetry = true, showHome = true } = this.props;

    if (hasError) {
      // Custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            p: 3,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              maxWidth: 500,
              width: '100%',
              p: 4,
              textAlign: 'center',
              border: 1,
              borderColor: 'error.light',
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'error.light',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 3,
              }}
            >
              <AlertTriangle size={32} color="white" />
            </Box>

            <Typography variant="h5" gutterBottom fontWeight={600}>
              Something went wrong
            </Typography>

            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {name
                ? `An error occurred in the ${name} section.`
                : 'An unexpected error occurred.'}
              {' '}Please try again or return to the dashboard.
            </Typography>

            {process.env.NODE_ENV === 'development' && error && (
              <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                <Typography variant="body2" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
                  {error.message}
                </Typography>
              </Alert>
            )}

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              {showRetry && (
                <Button
                  variant="contained"
                  startIcon={<RefreshCw size={18} />}
                  onClick={this.handleRetry}
                >
                  Try Again
                </Button>
              )}
              {showHome && (
                <Button
                  variant="outlined"
                  startIcon={<Home size={18} />}
                  onClick={this.handleGoHome}
                >
                  Go to Dashboard
                </Button>
              )}
            </Box>
          </Paper>
        </Box>
      );
    }

    return children;
  }
}

/**
 * PageErrorBoundary - Specialized error boundary for full pages
 * Provides a more prominent error display with page name context
 */
export const PageErrorBoundary: React.FC<{
  children: ReactNode;
  pageName: string;
}> = ({ children, pageName }) => {
  return (
    <ErrorBoundary name={pageName} showHome={true} showRetry={true}>
      {children}
    </ErrorBoundary>
  );
};

/**
 * SectionErrorBoundary - Specialized error boundary for page sections
 * Provides a compact error display suitable for widgets/cards
 */
export const SectionErrorBoundary: React.FC<{
  children: ReactNode;
  sectionName: string;
}> = ({ children, sectionName }) => {
  return (
    <ErrorBoundary
      name={sectionName}
      showHome={false}
      showRetry={true}
      fallback={
        <Box
          sx={{
            p: 2,
            textAlign: 'center',
            bgcolor: 'error.light',
            borderRadius: 1,
            opacity: 0.9,
          }}
        >
          <Typography variant="body2" color="error.contrastText">
            Failed to load {sectionName}
          </Typography>
          <Button
            size="small"
            variant="text"
            sx={{ color: 'error.contrastText', mt: 1 }}
            onClick={() => window.location.reload()}
          >
            Reload
          </Button>
        </Box>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundary;
