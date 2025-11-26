import { NextPageContext } from 'next';
import Link from 'next/link';
import { Box, Typography, Button, useTheme, alpha } from '@mui/material';
import { pmSyncColors } from '@/theme/appTheme';

interface ErrorProps {
  statusCode?: number;
}

function Error({ statusCode }: ErrorProps) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const title = statusCode === 404
    ? 'Page Not Found'
    : statusCode
    ? `Server Error ${statusCode}`
    : 'An error occurred';

  const message = statusCode === 404
    ? "Sorry, we couldn't find the page you're looking for."
    : 'Something went wrong on our end. Please try again later.';

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: isDark
          ? `linear-gradient(to bottom right, ${alpha(pmSyncColors.brand.purple, 0.2)}, ${theme.palette.background.default})`
          : `linear-gradient(to bottom right, ${alpha(pmSyncColors.brand.cyan, 0.1)}, ${theme.palette.background.default})`,
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 1,
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: '28rem' }}>
        <Typography
          variant="h1"
          sx={{
            fontWeight: 'bold',
            background: pmSyncColors.brand.gradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mb: 1,
          }}
        >
          {statusCode || 'Error'}
        </Typography>
        <Typography variant="h4" component="h2" sx={{ fontWeight: 600, color: 'text.primary', mb: 1 }}>
          {title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 2 }}>
          {message}
        </Typography>
        <Button
          component={Link}
          href="/"
          variant="contained"
          color="primary"
          sx={{
            display: 'inline-block',
            padding: '0.75rem 1.5rem',
            borderRadius: 1,
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          Go Back Home
        </Button>
      </Box>
    </Box>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
