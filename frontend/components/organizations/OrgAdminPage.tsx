import React, { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Skeleton,
  Chip,
  Collapse,
} from '@mui/material';
import {
  Plus,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  UserMinus,
  Building2,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useOrganizations,
  useOrganizationDetail,
  useRemoveMember,
} from '@/hooks/queries';
import { QueryErrorAlert } from '@/components/common/QueryErrorAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { InviteMemberDialog } from './InviteMemberDialog';
import { CreateOrgDialog } from './CreateOrgDialog';
import { DeleteOrgDialog } from './DeleteOrgDialog';

interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
}

interface OrganizationMemberRow {
  id: string;
  createdAt?: string | Date | null;
  email?: string | null;
  userId?: string | null;
  user?: {
    email?: string | null;
  } | null;
}

// ==========================================================================
// Organization Members Row (expandable)
// ==========================================================================

function OrgMembersSection({ orgId }: { orgId: string }) {
  const t = useTranslations();
  const { data: orgDetail, isLoading } = useOrganizationDetail(orgId);
  const removeMember = useRemoveMember();

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={100} />
      </Box>
    );
  }

  const members = (orgDetail?.members ?? []) as OrganizationMemberRow[];

  const handleRemove = async (memberIdOrEmail: string) => {
    if (!confirm(t.organizations.removeConfirm)) return;
    try {
      await removeMember.mutateAsync({ memberIdOrEmail, organizationId: orgId });
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{t.organizations.emailHeader}</TableCell>
            <TableCell>{t.organizations.joinedAt}</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {members.map((member) => {
            const memberIdentifier = member.user?.email || member.userId || member.email;

            return (
              <TableRow key={member.id}>
                <TableCell>{memberIdentifier || '-'}</TableCell>
                <TableCell>
                  {member.createdAt
                    ? new Date(member.createdAt).toLocaleDateString()
                    : '-'}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title={t.organizations.removeMember}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          if (memberIdentifier) {
                            void handleRemove(memberIdentifier);
                          }
                        }}
                        disabled={removeMember.isPending || !memberIdentifier}
                      >
                        <UserMinus size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
          {members.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} align="center">
                <Typography variant="body2" color="text.secondary">
                  {t.organizations.noOrganizations}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ==========================================================================
// Main Page
// ==========================================================================

export function OrgAdminPage() {
  const t = useTranslations();
  const { data: orgs, isLoading, error, refetch } = useOrganizations();
  const organizations = (orgs ?? []) as OrganizationListItem[];
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inviteTarget, setInviteTarget] = useState<string | null>(null);
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <QueryErrorAlert error={error} onRetry={() => refetch()} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1000 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: 1,
          mb: 3,
        }}
      >
        <Typography variant="h5" fontWeight={600}>
          {t.organizations.title}
        </Typography>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          {t.organizations.create}
        </Button>
      </Box>

      {/* Org List Table */}
      {isLoading ? (
        <Box>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ mb: 1 }} />
          ))}
        </Box>
      ) : organizations.length === 0 ? (
        <EmptyState
          icon={Building2}
          color="#7650ce"
          title={t.organizations.emptyTitle ?? 'No organizations'}
          description={t.organizations.emptyDescription ?? 'Organizations will appear when users create them'}
          actionLabel={t.organizations.create}
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 40 }} />
                <TableCell>{t.organizations.name}</TableCell>
                <TableCell>{t.organizations.slug}</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {organizations.map((org) => (
                <React.Fragment key={org.id}>
                  <TableRow
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() =>
                      setExpandedOrg(expandedOrg === org.id ? null : org.id)
                    }
                  >
                    <TableCell>
                      {expandedOrg === org.id ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight={500}>{org.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={org.slug} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Tooltip title={t.organizations.inviteMember}>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => setInviteTarget(org.id)}
                          >
                            <UserPlus size={16} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t.organizations.delete}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() =>
                              setDeleteTarget({ id: org.id, name: org.name })
                            }
                          >
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      sx={{ p: 0, borderBottom: expandedOrg === org.id ? undefined : 'none' }}
                    >
                      <Collapse in={expandedOrg === org.id} unmountOnExit>
                        <Box sx={{ py: 1, px: 2, bgcolor: 'action.hover' }}>
                          <Typography
                            variant="subtitle2"
                            sx={{ mb: 1, fontWeight: 600 }}
                          >
                            {t.organizations.members}
                          </Typography>
                          <OrgMembersSection orgId={org.id} />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialogs */}
      <CreateOrgDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {deleteTarget && (
        <DeleteOrgDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          orgName={deleteTarget.name}
          orgId={deleteTarget.id}
        />
      )}

      {inviteTarget && (
        <InviteMemberDialog
          open={!!inviteTarget}
          onClose={() => setInviteTarget(null)}
          organizationId={inviteTarget}
        />
      )}
    </Box>
  );
}
