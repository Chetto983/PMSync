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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Skeleton,
  Chip,
  CircularProgress,
  Collapse,
} from '@mui/material';
import {
  Plus,
  Trash2,
  UserPlus,
  ChevronDown,
  ChevronRight,
  UserMinus,
} from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import {
  useOrganizations,
  useOrganizationDetail,
  useCreateOrg,
  useDeleteOrg,
  useRemoveMember,
} from '@/hooks/queries';
import { InviteMemberDialog } from './InviteMemberDialog';

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
// Create Organization Dialog
// ==========================================================================

function CreateOrgDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const createOrg = useCreateOrg();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error && error.message
      ? error.message
      : t.common.genericError
  );

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !slug.trim()) return;

    try {
      await createOrg.mutateAsync({ name: name.trim(), slug: slug.trim() });
      setName('');
      setSlug('');
      onClose();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  const handleClose = () => {
    setName('');
    setSlug('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t.organizations.create}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label={t.organizations.name}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={createOrg.isPending}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label={t.organizations.slug}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={createOrg.isPending}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={createOrg.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!name.trim() || !slug.trim() || createOrg.isPending}
            startIcon={
              createOrg.isPending ? <CircularProgress size={16} /> : null
            }
          >
            {t.organizations.create}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// ==========================================================================
// Delete Confirmation Dialog
// ==========================================================================

function DeleteOrgDialog({
  open,
  onClose,
  orgName,
  orgId,
}: {
  open: boolean;
  onClose: () => void;
  orgName: string;
  orgId: string;
}) {
  const t = useTranslations();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const deleteOrg = useDeleteOrg();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error && error.message
      ? error.message
      : t.common.genericError
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (confirmation !== orgName) return;

    try {
      await deleteOrg.mutateAsync(orgId);
      setConfirmation('');
      onClose();
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    }
  };

  const handleClose = () => {
    setConfirmation('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{t.organizations.delete}</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ mb: 2 }}>{t.organizations.deleteConfirm}</Typography>
          <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
            {orgName}
          </Typography>
          <TextField
            autoFocus
            fullWidth
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={deleteOrg.isPending}
            placeholder={orgName}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={deleteOrg.isPending}>
            {t.common.cancel}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="error"
            disabled={confirmation !== orgName || deleteOrg.isPending}
            startIcon={
              deleteOrg.isPending ? <CircularProgress size={16} /> : null
            }
          >
            {t.organizations.delete}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
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
            <TableCell>Email</TableCell>
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
  const { data: orgs, isLoading, error } = useOrganizations();
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
        <Alert severity="error">{t.common.genericError}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1000 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
        <Alert severity="info">{t.organizations.noOrganizations}</Alert>
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
