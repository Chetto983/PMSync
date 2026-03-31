import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/layout/PortalLayout';
import { PortalTicketForm } from '@/components/portal/PortalTicketForm';

export default function PortalNewTicketPage() {
  const router = useRouter();
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : '';

  return (
    <PortalLayout tenantSlug={tenant}>
      <PortalTicketForm tenantSlug={tenant} />
    </PortalLayout>
  );
}
