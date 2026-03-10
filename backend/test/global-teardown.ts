/**
 * Jest globalTeardown: disconnects the shared Prisma test client.
 */
import { disconnectTestClient } from './helpers/prisma-test-client';

export default async function globalTeardown(): Promise<void> {
  await disconnectTestClient();
}
