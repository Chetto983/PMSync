import { useRouter } from 'next/router';
import { Box, AppBar, Toolbar, Typography, Container } from '@mui/material';
import { PortalCsatSurvey } from '@/components/portal/PortalCsatSurvey';

export default function PortalSurveyPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ maxWidth: 1200, width: '100%', mx: 'auto' }}>
          <Typography variant="h6" fontWeight={700} sx={{ color: 'text.primary' }}>
            PMSync
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ flex: 1, py: 3 }}>
        <PortalCsatSurvey token={token} />
      </Container>

      <Box component="footer" sx={{ borderTop: 1, borderColor: 'divider', py: 2, textAlign: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          Powered by PMSync
        </Typography>
      </Box>
    </Box>
  );
}
