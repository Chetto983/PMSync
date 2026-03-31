import { Layout } from '@/components/layout/Layout';
import { KBArticleEditor } from '@/components/dashboard/crm-kb/KBArticleEditor';

export default function KBNewArticlePage() {
  return (
    <Layout>
      <KBArticleEditor />
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
