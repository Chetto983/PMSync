import React, { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Button,
  List,
  ListItemAvatar,
  ListItemText,
  ListItemButton,
  Divider,
  LinearProgress,
  Badge,
  Chip,
  Skeleton,
  alpha,
} from '@mui/material';
import {
  Calendar,
  Mail,
  Users,
  CheckSquare,
  TrendingUp,
  Clock,
  Star,
  ArrowRight,
  Sparkles,
  Video,
  MapPin,
  Brain,
  Zap,
} from 'lucide-react';
import { DashboardCard } from './DashboardCard';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTranslations } from '@/lib/hooks/use-translations';
import { multiAgentApi } from '@/lib/api/ai';
import { websocketClient } from '@/lib/websocket-client';
import { useAuthStore } from '@/stores/auth-store';

interface Email {
  id: string;
  subject: string;
  from: { name: string; email: string };
  preview: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  provider?: {
    providerType: string;
  };
}

interface Event {
  id: string;
  title: string;
  startTime: Date;
  endTime?: Date;
  location?: string;
  type: 'meeting' | 'event';
}

interface Contact {
  id: string;
  name: string;
  email: string;
  company?: string;
  lastInteraction?: Date;
}

interface Stats {
  unreadEmails: number;
  todayEvents: number;
  pendingTasks: number;
  totalContacts: number;
}

interface AiStats {
  pendingActions: number;
  learningProgress: number;
  totalInteractions: number;
}

export function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const t = useTranslations();
  const token = useAuthStore((state) => state.token);
  const [_loading, setLoading] = useState(true);
  const [emails, setEmails] = useState<Email[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats>({
    unreadEmails: 0,
    todayEvents: 0,
    pendingTasks: 0,
    totalContacts: 0,
  });
  const [aiStats, setAiStats] = useState<AiStats>({
    pendingActions: 0,
    learningProgress: 0,
    totalInteractions: 0,
  });
  const [aiLoading, setAiLoading] = useState(true);

  // Load AI stats
  const loadAiStats = useCallback(async () => {
    try {
      setAiLoading(true);
      // Load pending actions - API returns { actions: [], total, limit, offset }
      const actionsResponse = await multiAgentApi.getPendingActions({ status: 'PENDING' });
      const actionsData = actionsResponse.data;
      const pendingCount = actionsData?.total ?? actionsData?.actions?.length ?? 0;

      // Load learning stats - API returns { success, stats: LearningProfileStats[] }
      let learningProgress = 0;
      let totalInteractions = 0;
      try {
        const learningResponse = await multiAgentApi.getLearningStats();
        const stats = learningResponse.data?.stats || [];
        totalInteractions = stats.reduce(
          (sum: number, s) => sum + s.totalAttempts,
          0
        );
        learningProgress = Math.min(100, totalInteractions);
      } catch {
        // Ignore learning stats errors
      }

      setAiStats({
        pendingActions: pendingCount,
        learningProgress,
        totalInteractions,
      });
    } catch (error) {
      console.error('Failed to load AI stats:', error);
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    loadAiStats();
  }, [loadAiStats]);

  // WebSocket subscription for real-time AI action updates
  useEffect(() => {
    if (!token || !websocketClient.isConnected()) return;

    // Refresh AI stats when any AI action event occurs
    const unsubCreated = websocketClient.onAiActionCreated(() => {
      loadAiStats();
    });

    const unsubApproved = websocketClient.onAiActionApproved(() => {
      loadAiStats();
    });

    const unsubRejected = websocketClient.onAiActionRejected(() => {
      loadAiStats();
    });

    const unsubExecuted = websocketClient.onAiActionExecuted(() => {
      loadAiStats();
    });

    return () => {
      unsubCreated();
      unsubApproved();
      unsubRejected();
      unsubExecuted();
    };
  }, [token, loadAiStats]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Load emails
      const emailsResponse = await apiClient.get('/emails', {
        params: { limit: 5, isStarred: true },
      });
      setEmails(emailsResponse.data.emails || []);

      // Load stats
      const statsResponse = await apiClient.get('/emails/stats');

      // Load contacts count
      const contactsResponse = await apiClient.get('/contacts', {
        params: { limit: 5 },
      });
      setContacts(contactsResponse.data.contacts || []);

      // Load calendar events for today
      let todayEventsCount = 0;
      try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

        const eventsResponse = await apiClient.get('/calendar/events', {
          params: {
            startTime: startOfDay.toISOString(),
            endTime: endOfDay.toISOString(),
          },
        });
        const todayEvents = eventsResponse.data.events || [];
        setEvents(todayEvents);
        todayEventsCount = todayEvents.length;
      } catch (error) {
        console.error('Failed to load calendar events:', error);
        setEvents([]);
      }

      setStats({
        unreadEmails: statsResponse.data.unread || 0,
        todayEvents: todayEventsCount,
        pendingTasks: 0, // Phase 5: Tasks module (not yet implemented)
        totalContacts: contactsResponse.data.total || contactsResponse.data.contacts?.length || 0,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t.greetings.morning;
    if (hour < 18) return t.greetings.afternoon;
    return t.greetings.evening;
  };

  const getProviderIcon = (providerType?: string) => {
    switch (providerType) {
      case 'google':
        return '📧';
      case 'microsoft':
        return '📨';
      default:
        return '📬';
    }
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return t.timeAgo.justNow;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t.timeAgo.minutesAgo.replace('{minutes}', minutes.toString());
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t.timeAgo.hoursAgo.replace('{hours}', hours.toString());
    const days = Math.floor(hours / 24);
    return t.timeAgo.daysAgo.replace('{days}', days.toString());
  };

  return (
    <Box>
      {/* Header Section - More compact */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0 }}>
          {getGreeting()}, {user?.firstName || user?.email?.split('@')[0] || 'User'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t.greetings.subtitle}
        </Typography>
      </Box>

      {/* Quick Stats - More compact */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          mb: 2,
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        {[
          {
            value: stats.unreadEmails,
            label: t.dashboard.home.stats.unreadEmails,
            icon: <Mail size={24} color="white" />,
            color: 'primary.main',
          },
          {
            value: stats.todayEvents,
            label: t.dashboard.home.stats.todayEvents,
            icon: <Calendar size={24} color="white" />,
            color: 'success.main',
          },
          {
            value: stats.pendingTasks,
            label: t.dashboard.home.stats.pendingTasks,
            icon: <CheckSquare size={24} color="white" />,
            color: 'warning.main',
          },
          {
            value: stats.totalContacts,
            label: t.dashboard.home.stats.contacts,
            icon: <Users size={24} color="white" />,
            color: 'info.main',
          },
        ].map((stat) => (
          <DashboardCard key={stat.label}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1.5,
                  bgcolor: stat.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {React.cloneElement(stat.icon, { size: 20 })}
              </Box>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  {stat.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stat.label}
                </Typography>
              </Box>
            </Box>
          </DashboardCard>
        ))}
      </Box>

      {/* Main Content Grid - More compact */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: '2fr 1fr',
          },
        }}
      >
        {/* Left Column */}
        <Box>
          {/* Upcoming Events */}
          <DashboardCard
            title={t.dashboard.home.sections.upcomingEvents}
            subtitle={t.dashboard.home.sections.upcomingEventsSubtitle}
            sx={{ mb: 2 }}
          >
            {events.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 2,
                }}
              >
                <Calendar size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <Typography variant="body2" color="text.secondary">
                  {t.dashboard.home.sections.noEvents}
                </Typography>
                <Button
                  variant="contained"
                  startIcon={<Calendar size={18} />}
                  sx={{ mt: 2 }}
                  onClick={() => router.push('/dashboard/calendar')}
                >
                  {t.dashboard.home.sections.viewCalendar}
                </Button>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {events.map((event, index) => (
                  <React.Fragment key={event.id}>
                    {index > 0 && <Divider />}
                    <ListItemButton onClick={() => router.push('/dashboard/calendar')}>
                      <ListItemAvatar>
                        <Avatar sx={{ bgcolor: 'primary.main' }}>
                          {event.type === 'meeting' ? (
                            <Video size={20} />
                          ) : (
                            <Calendar size={20} />
                          )}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={event.title}
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Clock size={14} />
                            <span>
                              {new Date(event.startTime).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {event.location && (
                              <>
                                <MapPin size={14} style={{ marginLeft: 8 }} />
                                <span>{event.location}</span>
                              </>
                            )}
                          </Box>
                        }
                      />
                      <Button size="small" variant="outlined">
                        {t.common.join}
                      </Button>
                    </ListItemButton>
                  </React.Fragment>
                ))}
              </List>
            )}
          </DashboardCard>

          {/* Priority Inbox */}
          <DashboardCard title={t.dashboard.home.sections.priorityInbox} subtitle={t.dashboard.home.sections.priorityInboxSubtitle}>
            {emails.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Star size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                <Typography variant="body2" color="text.secondary">
                  {t.dashboard.home.sections.noStarredEmails}
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {emails.slice(0, 5).map((email, index) => (
                  <React.Fragment key={email.id}>
                    {index > 0 && <Divider />}
                    <ListItemButton onClick={() => router.push(`/dashboard/email?id=${email.id}`)}>
                      <ListItemAvatar>
                        <Badge
                          badgeContent={getProviderIcon(email.provider?.providerType)}
                          anchorOrigin={{
                            vertical: 'bottom',
                            horizontal: 'right',
                          }}
                          sx={{
                            '& .MuiBadge-badge': {
                              fontSize: '0.6rem',
                              minWidth: 18,
                              height: 18,
                              padding: 0,
                              backgroundColor: 'transparent',
                            },
                          }}
                        >
                          <Avatar>
                            {email.from.name?.[0]?.toUpperCase() || 'U'}
                          </Avatar>
                        </Badge>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{ fontWeight: email.isRead ? 400 : 600 }}
                            >
                              {email.from.name}
                            </Typography>
                            {email.isStarred && (
                              <Star size={14} fill="currentColor" color="#FFB300" />
                            )}
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: email.isRead ? 400 : 600,
                                color: 'text.primary',
                              }}
                            >
                              {email.subject}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                display: '-webkit-box',
                                WebkitLineClamp: 1,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                              }}
                            >
                              {email.preview}
                            </Typography>
                          </Box>
                        }
                      />
                      <Typography variant="caption" color="text.secondary">
                        {formatTimeAgo(email.date)}
                      </Typography>
                    </ListItemButton>
                  </React.Fragment>
                ))}
              </List>
            )}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                endIcon={<ArrowRight size={18} />}
                onClick={() => router.push('/dashboard/email')}
              >
                {t.dashboard.home.sections.viewAllEmails}
              </Button>
            </Box>
          </DashboardCard>
        </Box>

        {/* Right Column */}
        <Box>
          {/* AI Assistant Hub - Modern Design */}
          <Box
            sx={{
              borderRadius: 3,
              overflow: 'hidden',
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              mb: 2,
            }}
          >
            {/* Gradient Header */}
            <Box
              sx={{
                background: (theme) =>
                  `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 50%, #7c3aed 100%)`,
                p: 2.5,
                color: 'white',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Decorative circles */}
              <Box
                sx={{
                  position: 'absolute',
                  top: -20,
                  right: -20,
                  width: 100,
                  height: 100,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.1)',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: -30,
                  right: 40,
                  width: 60,
                  height: 60,
                  borderRadius: '50%',
                  bgcolor: 'rgba(255,255,255,0.08)',
                }}
              />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, position: 'relative' }}>
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    borderRadius: 2,
                    bgcolor: 'rgba(255,255,255,0.2)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Sparkles size={22} />
                </Box>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {t.dashboard.home.sections.aiInsights || 'AI Assistant'}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    {t.dashboard.home.sections.aiInsightsSubtitle || 'Your intelligent email companion'}
                  </Typography>
                </Box>
                {aiStats.pendingActions > 0 && (
                  <Chip
                    size="small"
                    label={aiStats.pendingActions}
                    sx={{
                      ml: 'auto',
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      fontWeight: 700,
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { transform: 'scale(1)' },
                        '50%': { transform: 'scale(1.1)' },
                      },
                    }}
                  />
                )}
              </Box>

              <Typography variant="body2" sx={{ opacity: 0.95, position: 'relative' }}>
                {stats.unreadEmails > 0
                  ? stats.unreadEmails > 1
                    ? t.dashboard.home.sections.aiAssistMessage?.replace('{count}', stats.unreadEmails.toString())?.replace('{plural}', 's') || `Ready to help with ${stats.unreadEmails} unread emails`
                    : t.dashboard.home.sections.aiAssistMessageSingular?.replace('{count}', '1') || 'Ready to help with 1 unread email'
                  : t.common.allCaughtUp || 'All caught up! No unread emails.'}
              </Typography>
            </Box>

            {/* Content */}
            <Box sx={{ p: 2 }}>
              {/* Pending Actions Alert */}
              {aiStats.pendingActions > 0 && (
                <Box
                  sx={{
                    p: 1.5,
                    mb: 2,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette.warning.main, 0.1),
                    border: 1,
                    borderColor: (theme) => alpha(theme.palette.warning.main, 0.3),
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: (theme) => alpha(theme.palette.warning.main, 0.15),
                      transform: 'translateX(4px)',
                    },
                  }}
                  onClick={() => router.push('/dashboard/ai')}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 1.5,
                      bgcolor: 'warning.main',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                    }}
                  >
                    <Zap size={18} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {aiStats.pendingActions} {t.ai?.pendingActions || 'pending actions'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t.ai?.pendingActionsHint || 'Review AI suggestions'}
                    </Typography>
                  </Box>
                  <ArrowRight size={16} />
                </Box>
              )}

              {/* AI Stats Grid */}
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 1.5,
                  mb: 2,
                }}
              >
                {/* Unread Emails */}
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    textAlign: 'center',
                  }}
                >
                  {aiLoading ? (
                    <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
                  ) : (
                    <>
                      <Mail size={18} style={{ marginBottom: 4 }} />
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {stats.unreadEmails}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t.ai?.unread || 'Unread'}
                      </Typography>
                    </>
                  )}
                </Box>

                {/* AI Learning */}
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                    textAlign: 'center',
                  }}
                >
                  {aiLoading ? (
                    <Skeleton variant="text" width="60%" sx={{ mx: 'auto' }} />
                  ) : (
                    <>
                      <Brain size={18} style={{ marginBottom: 4 }} />
                      <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        {aiStats.totalInteractions}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {t.ai?.learned || 'Learned'}
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>

              {/* Learning Progress */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Brain size={12} />
                    {t.ai?.writingStyleLearning || 'AI Learning Progress'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {aiStats.learningProgress}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={aiStats.learningProgress}
                  sx={{
                    height: 6,
                    borderRadius: 3,
                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 3,
                      background: (theme) =>
                        `linear-gradient(90deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
                    },
                  }}
                />
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {aiStats.learningProgress < 20
                    ? t.ai?.writingStyleLearningLow || 'Getting started - send more emails'
                    : aiStats.learningProgress < 60
                    ? t.ai?.writingStyleLearningMedium || 'Learning your style'
                    : t.ai?.writingStyleLearningHigh || 'AI knows your style well'}
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Quick Actions - Chip Style */}
              <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
                {t.dashboard.home.sections.quickActions || 'Quick Actions'}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip
                  icon={<Sparkles size={14} />}
                  label={t.dashboard.home.sections.smartCompose || 'Smart Compose'}
                  onClick={() => router.push('/dashboard/ai')}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '& .MuiChip-icon': { color: 'white' },
                    },
                  }}
                  variant="outlined"
                />
                <Chip
                  icon={<TrendingUp size={14} />}
                  label={t.dashboard.home.sections.analyzeInbox || 'Analyze'}
                  onClick={() => router.push('/dashboard/ai')}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '& .MuiChip-icon': { color: 'white' },
                    },
                  }}
                  variant="outlined"
                />
                <Chip
                  icon={<Mail size={14} />}
                  label={t.ai?.summarize || 'Summarize'}
                  onClick={() => router.push('/dashboard/ai')}
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: 'primary.main',
                      color: 'white',
                      '& .MuiChip-icon': { color: 'white' },
                    },
                  }}
                  variant="outlined"
                />
              </Box>

              {/* Full AI Hub Button */}
              <Button
                fullWidth
                variant="contained"
                endIcon={<ArrowRight size={16} />}
                onClick={() => router.push('/dashboard/ai')}
                sx={{
                  mt: 2,
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  background: (theme) =>
                    `linear-gradient(135deg, ${theme.palette.primary.main} 0%, #7c3aed 100%)`,
                  '&:hover': {
                    background: (theme) =>
                      `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, #6d28d9 100%)`,
                  },
                }}
              >
                {t.dashboard.home.sections.viewSuggestions || 'Open AI Assistant'}
              </Button>
            </Box>
          </Box>

          {/* Recent Connections */}
          <DashboardCard title={t.dashboard.home.sections.recentConnections} subtitle={t.dashboard.home.sections.recentConnectionsSubtitle}>
            {contacts.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {t.dashboard.home.sections.noRecentContacts}
                </Typography>
              </Box>
            ) : (
              <List sx={{ p: 0 }}>
                {contacts.slice(0, 5).map((contact, index) => (
                  <React.Fragment key={contact.id}>
                    {index > 0 && <Divider />}
                    <ListItemButton
                      onClick={() => router.push(`/dashboard/contacts?id=${contact.id}`)}
                    >
                      <ListItemAvatar>
                        <Avatar>{contact.name?.[0]?.toUpperCase() || 'U'}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={contact.name}
                        secondary={contact.company || contact.email}
                        primaryTypographyProps={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                        }}
                        secondaryTypographyProps={{
                          fontSize: '0.75rem',
                        }}
                      />
                    </ListItemButton>
                  </React.Fragment>
                ))}
              </List>
            )}
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Button
                endIcon={<ArrowRight size={18} />}
                onClick={() => router.push('/dashboard/contacts')}
              >
                {t.common.viewAll}
              </Button>
            </Box>
          </DashboardCard>
        </Box>
      </Box>
    </Box>
  );
}

