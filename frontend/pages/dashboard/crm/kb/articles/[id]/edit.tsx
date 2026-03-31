import { useRouter } from 'next/router';
import { Layout } from '@/components/layout/Layout';
import { KBArticleEditor } from '@/components/dashboard/crm-kb/KBArticleEditor';

export default function KBEditArticlePage() {
  const router = useRouter();
  const { id } = router.query;

  return (
    <Layout>
      <KBArticleEditor articleId={typeof id === 'string' ? id : undefined} />
    </Layout>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
