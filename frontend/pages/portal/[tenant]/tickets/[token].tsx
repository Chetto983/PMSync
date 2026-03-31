import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/layout/PortalLayout';
import { PortalTicketTracking } from '@/components/portal/PortalTicketTracking';

export default function PortalTicketTrackingPage() {
  const router = useRouter();
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : '';
  const token = typeof router.query.token === 'string' ? router.query.token : '';

  return (
    <PortalLayout tenantSlug={tenant}>
      <PortalTicketTracking tenantSlug={tenant} token={token} />
    </PortalLayout>
  );
}
