import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle } from 'lucide-react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface Props {
  toolName: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Error boundary that wraps individual tool renderers.
 * On crash, shows a graceful fallback instead of breaking the entire chat.
 * Addresses FE-H3: tool UIs that destructure malformed data no longer crash.
 */
export class ToolErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message ?? 'Unknown error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ToolErrorBoundary] ${this.props.toolName} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Paper variant="outlined" sx={{ borderRadius: '10px', p: 1.5, borderColor: 'warning.main' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AlertTriangle size={14} color="var(--mui-palette-warning-main)" />
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
              {this.props.toolName}
            </Typography>
            <Typography
              sx={{ ml: 'auto', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'warning.main' }}
            >
              Render Error
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {this.state.errorMessage}
          </Typography>
        </Paper>
      );
    }
    return this.props.children;
  }
}
