import type { NextApiRequest, NextApiResponse } from 'next';
import { auth } from '@/lib/auth';

// Re-use the singleton PrismaClient from auth module to avoid connection churn.
// auth.ts already creates a globalThis-cached PrismaClient.
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const prisma = globalForPrisma.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') return res.status(405).end();

  // Validate session using better-auth
  const session = await auth.api.getSession({
    headers: req.headers as unknown as Headers,
  });
  if (!session?.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check user doesn't already have a tenant
  if ((session.user as Record<string, unknown>).tenantId) {
    return res.status(400).json({ error: 'Workspace already exists' });
  }

  const { workspaceName } = req.body as { workspaceName?: string };
  if (
    !workspaceName ||
    typeof workspaceName !== 'string' ||
    workspaceName.trim().length < 2
  ) {
    return res
      .status(400)
      .json({ error: 'Workspace name must be at least 2 characters' });
  }

  try {
    const slug = workspaceName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .slice(0, 30);

    // Mirrors provisionWorkspaceForUser from backend better-auth.instance.ts
    const tenant = await prisma.tenant.create({
      data: {
        name: workspaceName.trim(),
        slug: `${slug}-${Date.now().toString(36)}`,
        isActive: true,
      },
    });

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        tenantId: tenant.id,
        role: 'admin',
        isActive: true,
      },
    });

    res.status(201).json({ tenantId: tenant.id });
  } catch (error) {
    console.error('Workspace creation failed:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
}
