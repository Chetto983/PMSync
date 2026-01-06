SELECT t.id, t.name,
       (SELECT COUNT(*) FROM emails WHERE "tenantId" = t.id) as email_count,
       (SELECT COUNT(*) FROM provider_configs WHERE "tenantId" = t.id) as provider_count
FROM tenants t
LIMIT 5;
