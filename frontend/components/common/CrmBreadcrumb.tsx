import React from 'react';
import { Breadcrumbs, Typography, Link as MuiLink } from '@mui/material';
import NextLink from 'next/link';
import { useTranslations } from '@/lib/hooks/use-translations';

export interface CrmBreadcrumbProps {
  /** The CRM section name (e.g. "Accounts", "Deals", "Tickets") */
  section: string;
  /** The href for the section list page (e.g. "/dashboard/crm/accounts") */
  sectionHref: string;
  /** Optional entity name — when provided, section becomes a link and entity is plain text */
  entityName?: string;
}

export function CrmBreadcrumb({ section, sectionHref, entityName }: CrmBreadcrumbProps) {
  const t = useTranslations();

  return (
    <Breadcrumbs sx={{ mb: 1 }}>
      <MuiLink
        component={NextLink}
        href="/dashboard"
        underline="hover"
        color="text.secondary"
        variant="body2"
      >
        {t.crmAccounts?.breadcrumb?.dashboard ?? 'Dashboard'}
      </MuiLink>
      <Typography variant="body2" color="text.secondary">
        {t.crmAccounts?.breadcrumb?.crm ?? 'CRM'}
      </Typography>
      {entityName ? (
        <MuiLink
          component={NextLink}
          href={sectionHref}
          underline="hover"
          color="text.secondary"
          variant="body2"
        >
          {section}
        </MuiLink>
      ) : (
        <Typography variant="body2" color="text.primary">
          {section}
        </Typography>
      )}
      {entityName && (
        <Typography variant="body2" color="text.primary">
          {entityName}
        </Typography>
      )}
    </Breadcrumbs>
  );
}
