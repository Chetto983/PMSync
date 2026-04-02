import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/dashboard/crm/accounts', permanent: false },
});

export default function CrmIndexPage() {
  return null;
}
