import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Collapse,
  IconButton,
  Chip,
  Skeleton,
} from '@mui/material';
import { ChevronRight, ChevronDown, Building2, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/router';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useAccountChildren } from '@/hooks/queries/use-crm-accounts';
import type { CrmAccount } from '@/lib/api/crm-accounts';

// ---- Lazy-loading child node ----

function ChildNode({ child }: { child: { id: string; name: string } }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { data: grandchildren, isLoading } = useAccountChildren(
    expanded ? child.id : '',
  );

  const hasChildren = !isLoading && grandchildren && grandchildren.length > 0;

  return (
    <Box sx={{ ml: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          py: 0.5,
          '&:hover': { bgcolor: 'action.hover' },
          borderRadius: 1,
          px: 0.5,
        }}
      >
        <IconButton
          size="small"
          onClick={() => setExpanded(!expanded)}
          sx={{ visibility: hasChildren || isLoading ? 'visible' : 'hidden' }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </IconButton>
        <Building2 size={14} />
        <Typography
          variant="body2"
          sx={{
            cursor: 'pointer',
            '&:hover': { textDecoration: 'underline' },
            flex: 1,
          }}
          onClick={() => router.push(`/dashboard/crm/accounts/${child.id}`)}
        >
          {child.name}
        </Typography>
        <IconButton
          size="small"
          onClick={() => router.push(`/dashboard/crm/accounts/${child.id}`)}
        >
          <ArrowUpRight size={12} />
        </IconButton>
      </Box>
      {expanded && isLoading && (
        <Box sx={{ ml: 3, py: 0.5 }}>
          <Skeleton width="60%" height={20} />
        </Box>
      )}
      <Collapse in={expanded}>
        {grandchildren?.map((gc) => (
          <ChildNode key={gc.id} child={gc} />
        ))}
      </Collapse>
    </Box>
  );
}

// ---- Main Component ----

export function AccountHierarchyTree({ account }: { account: CrmAccount }) {
  const t = useTranslations();
  const ta = t.crmAccounts?.detail?.hierarchy;
  const router = useRouter();

  const { data: children, isLoading } = useAccountChildren(account.id);

  const hasParent = !!account.parent;
  const hasChildren = !isLoading && children && children.length > 0;

  if (!hasParent && !hasChildren && !isLoading) {
    return null;
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {ta?.title ?? 'Account Hierarchy'}
      </Typography>

      {/* Parent */}
      {hasParent && (
        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {ta?.parent ?? 'Parent Account'}
          </Typography>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              py: 0.5,
              px: 0.5,
              '&:hover': { bgcolor: 'action.hover' },
              borderRadius: 1,
              cursor: 'pointer',
            }}
            onClick={() =>
              router.push(`/dashboard/crm/accounts/${account.parent!.id}`)
            }
          >
            <Building2 size={14} />
            <Typography variant="body2">{account.parent!.name}</Typography>
            <ArrowUpRight size={12} />
          </Box>
        </Box>
      )}

      {/* Current account */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          py: 0.5,
          px: 0.5,
          bgcolor: 'action.selected',
          borderRadius: 1,
          ml: hasParent ? 3 : 0,
        }}
      >
        <Building2 size={16} />
        <Typography variant="body2" fontWeight={600}>
          {account.name}
        </Typography>
        <Chip label="current" size="small" sx={{ height: 18, fontSize: 11 }} />
      </Box>

      {/* Children */}
      {isLoading && (
        <Box sx={{ ml: hasParent ? 6 : 3, py: 0.5 }}>
          <Skeleton width="50%" height={20} />
          <Skeleton width="40%" height={20} />
        </Box>
      )}

      <Box sx={{ ml: hasParent ? 3 : 0 }}>
        {children?.map((child) => (
          <ChildNode key={child.id} child={child} />
        ))}
      </Box>

      {!hasChildren && !isLoading && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: hasParent ? 6 : 3, display: 'block', mt: 0.5 }}
        >
          {ta?.noChildren ?? 'No sub-accounts'}
        </Typography>
      )}
    </Paper>
  );
}
