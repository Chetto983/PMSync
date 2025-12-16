import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';

type DevUserRow = {
  id: string;
  tenantId: string;
  email: string;
  role: string;
};

export type E2eAuthContext = {
  token: string;
  user: DevUserRow;
};

function parseDotEnv(contents: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    if (!key) continue;

    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function readBackendEnvFile(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../../../backend/.env');
  if (!fs.existsSync(envPath)) return {};
  return parseDotEnv(fs.readFileSync(envPath, 'utf8'));
}

export async function getE2eAuthToken(): Promise<string> {
  return (await getE2eAuthContext()).token;
}

export async function getE2eAuthContext(): Promise<E2eAuthContext> {
  if (process.env.E2E_AUTH_TOKEN) {
    const email = process.env.E2E_USER_EMAIL;
    if (!email) {
      throw new Error('When E2E_AUTH_TOKEN is set, E2E_USER_EMAIL is required.');
    }

    return {
      token: process.env.E2E_AUTH_TOKEN,
      user: { id: 'unknown', tenantId: 'unknown', email, role: 'unknown' },
    };
  }

  const backendEnv = readBackendEnvFile();
  const jwtSecret = process.env.JWT_SECRET || backendEnv.JWT_SECRET;
  const databaseUrl = process.env.DATABASE_URL || backendEnv.DATABASE_URL;

  if (!jwtSecret) {
    throw new Error(
      'E2E JWT secret not found. Set JWT_SECRET in the environment or ensure backend/.env exists.',
    );
  }

  if (!databaseUrl) {
    throw new Error(
      'E2E database URL not found. Set DATABASE_URL in the environment or ensure backend/.env exists.',
    );
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const requestedEmail = process.env.E2E_USER_EMAIL;
    const result = requestedEmail
      ? await client.query<DevUserRow>(
          'SELECT id, \"tenantId\" as \"tenantId\", email, role FROM users WHERE email = $1 AND \"isActive\" = true AND \"deletedAt\" IS NULL LIMIT 1',
          [requestedEmail],
        )
      : await client.query<DevUserRow>(
          'SELECT id, \"tenantId\" as \"tenantId\", email, role FROM users WHERE \"isActive\" = true AND \"deletedAt\" IS NULL ORDER BY \"updatedAt\" DESC LIMIT 1',
        );

    if (result.rows.length === 0) {
      throw new Error(
        requestedEmail
          ? `No active user found for E2E_USER_EMAIL=${requestedEmail}`
          : 'No active users found for E2E auth bootstrap',
      );
    }

    const user = result.rows[0];

    const token = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenantId,
        email: user.email,
        role: user.role,
        iat: Math.floor(Date.now() / 1000),
      },
      jwtSecret,
      { expiresIn: '1h' },
    );

    return { token, user };
  } finally {
    await client.end();
  }
}
