const { PrismaClient } = require('@prisma/client');
const { startOfDay, endOfDay, subDays } = require('date-fns');
require('dotenv').config();

const prisma = new PrismaClient();

async function auditDashboardData() {
    console.log('🔍 Starting Main Dashboard Data Audit (Simple Version)...');

    try {
        // 1. Unread Emails
        console.log('\n📧 Auditing Unread Emails...');
        const unreadCount = await prisma.email.count({
            where: {
                isRead: false,
                isDeleted: false,
                folder: {
                    notIn: ['TRASH', 'SPAM', 'JUNK', 'SENT', 'DRAFTS']
                }
            }
        });
        console.log(`- Total Unread Emails (excluding junk): ${unreadCount}`);

        // 2. Today's Events
        console.log('\n📅 Auditing Calendar Events...');
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);

        const eventsToday = await prisma.calendarEvent.count({
            where: {
                startTime: {
                    gte: todayStart,
                    lte: todayEnd
                }
            }
        });
        console.log(`- Events Today (${todayStart.toISOString().split('T')[0]}): ${eventsToday}`);

        // 3. Pending FollowUps
        console.log('\nue803 Auditing Pending FollowUps...');
        try {
            const pendingFollowUps = await prisma.emailFollowUp.count({
                where: {
                    status: 'PENDING'
                }
            });
            const overdueFollowUps = await prisma.emailFollowUp.count({
                where: {
                    status: 'PENDING',
                    dueDate: { lt: now }
                }
            });
            console.log(`- Pending FollowUps: ${pendingFollowUps}`);
            console.log(`- Overdue FollowUps: ${overdueFollowUps}`);
        } catch (e) {
            console.log(`- [WARNING] Could not query emailFollowUp: ${e.message}`);
        }

        // 4. Deadlines
        console.log('\n⏰ Auditing Deadlines...');
        try {
            const deadlines = await prisma.aiDeadline.count({
                where: {
                    deadline: {
                        gte: now
                    }
                }
            });
            console.log(`- Upcoming Deadlines: ${deadlines}`);
        } catch (e) {
            console.log(`- [WARNING] Could not query aiDeadline: ${e.message}`);
        }

        // 5. CRM Stale Contacts
        console.log('\n👥 Auditing CRM Stale Contacts...');
        try {
            const thirtyDaysAgo = subDays(now, 30);
            const staleContacts = await prisma.contact.count({
                where: {
                    lastInteractedAt: {
                        lt: thirtyDaysAgo
                    }
                }
            });
            console.log(`- Stale Contacts (>30 days): ${staleContacts}`);
        } catch (e) {
            console.log(`- [WARNING] Could not query stale contacts: ${e.message}`);
        }

        // 6. Action Items
        console.log('\n✅ Auditing Action Items...');
        try {
            const pendingActions = await prisma.agentPendingAction.count({
                where: {
                    status: 'PENDING'
                }
            });
            console.log(`- Pending Action Items: ${pendingActions}`);
        } catch (e) {
            console.log(`- [WARNING] Could not query agentPendingAction: ${e.message}`);
        }

    } catch (error) {
        console.error('❌ Audit Failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

auditDashboardData();
