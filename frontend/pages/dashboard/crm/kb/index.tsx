import { Layout } from '@/components/layout/Layout';
import { KBBrowsePage } from '@/components/dashboard/crm-kb/KBBrowsePage';

export default function KBIndexPage() {
  return (
    <Layout>
      <KBBrowsePage />
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
