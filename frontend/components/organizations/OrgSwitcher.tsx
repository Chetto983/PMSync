import React, { useState } from 'react';
import {
  Button,
  Menu,
  MenuItem,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  alpha,
} from '@mui/material';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useOrganizations, useSetActiveOrg } from '@/hooks/queries';
import { authClient, type SessionUser } from '@/lib/auth-client';

/**
 * Organization switcher dropdown.
 * Only renders if the current user belongs to 2+ organizations.
 * Placed in the Header for global context switching.
 */
export function OrgSwitcher() {
  const t = useTranslations();
  const { data: orgs } = useOrganizations();
  const setActiveOrg = useSetActiveOrg();
  const { data: session } = authClient.useSession();
  const user = session?.user as SessionUser | undefined;
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  // Only render for users with 2+ orgs
  if (!orgs || orgs.length < 2) return null;

  const activeOrgId = user?.tenantId;
  const activeOrg = (orgs as any[]).find((o: any) => o.id === activeOrgId);

  const handleSwitch = async (orgId: string) => {
    setAnchorEl(null);
    if (orgId === activeOrgId) return;
    try {
      await setActiveOrg.mutateAsync(orgId);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <>
      <Button
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        endIcon={
          setActiveOrg.isPending ? (
            <CircularProgress size={14} />
          ) : (
            <ChevronDown size={14} />
          )
        }
        startIcon={<Building2 size={16} />}
        sx={{
          textTransform: 'none',
          fontWeight: 500,
          fontSize: '0.8125rem',
          px: 1.5,
          color: 'text.primary',
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.06),
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.12),
          },
        }}
        disabled={setActiveOrg.isPending}
      >
        {activeOrg?.name || t.organizations.switchOrg}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {(orgs as any[]).map((org: any) => (
          <MenuItem
            key={org.id}
            onClick={() => handleSwitch(org.id)}
            selected={org.id === activeOrgId}
          >
            {org.id === activeOrgId && (
              <ListItemIcon sx={{ minWidth: 28 }}>
                <Check size={16} />
              </ListItemIcon>
            )}
            <ListItemText
              inset={org.id !== activeOrgId}
              primary={org.name}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
