import { Layout } from '@/components/layout/Layout';
import { TodayDashboard } from '@/components/dashboard/today';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * Dashboard Page — AI-curated "Today" feed (Phase 145, NAV-05).
 * Replaces the legacy widget grid with a single prioritized list (urgent / today / fyi).
 */
export default function DashboardPage() {
    return (
        <Layout>
            <PageErrorBoundary pageName="Dashboard">
                <TodayDashboard />
            </PageErrorBoundary>
        </Layout>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
