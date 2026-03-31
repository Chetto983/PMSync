import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/layout/PortalLayout';
import { PortalKBBrowse } from '@/components/portal/PortalKBBrowse';

export default function PortalTenantIndexPage() {
  const router = useRouter();
  const tenant = typeof router.query.tenant === 'string' ? router.query.tenant : '';

  return (
    <PortalLayout tenantSlug={tenant}>
      <PortalKBBrowse tenantSlug={tenant} />
    </PortalLayout>
  );
}
