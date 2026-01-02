import { Layout } from '@/components/layout/Layout';
import DashboardContainer from '@/components/dashboard/DashboardContainer';
import { PageErrorBoundary } from '@/components/common/ErrorBoundary';

/**
 * Dashboard Page
 *
 * Main dashboard with customizable widgets following 2025 best practices:
 * - TanStack Query for server state (layout from API)
 * - Zustand for client state (editMode, UI state)
 * - react-grid-layout for drag-and-drop
 */
export default function DashboardPage() {
    return (
        <Layout>
            <PageErrorBoundary pageName="Dashboard">
                <DashboardContainer />
            </PageErrorBoundary>
        </Layout>
    );
}

export async function getServerSideProps() {
    return { props: {} };
}
