/**
 * Generate ES256 (ECDSA P-256) keypair for JWT signing.
 *
 * Usage: npx ts-node backend/scripts/generate-es256-keys.ts
 *
 * Outputs env-var-ready format with escaped newlines for .env file.
 */
import * as crypto from 'crypto';

function main() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const kid = crypto
    .createHash('sha256')
    .update(publicKey)
    .digest('hex')
    .substring(0, 8);

  // Escape newlines for .env format
  const privateKeyEnv = privateKey.replace(/\n/g, '\\n');
  const publicKeyEnv = publicKey.replace(/\n/g, '\\n');

  console.log('=== ES256 JWT Keypair Generated ===\n');
  console.log(`Key ID (kid): ${kid}\n`);
  console.log('Add these to your .env file:\n');
  console.log(`JWT_PRIVATE_KEY="${privateKeyEnv}"`);
  console.log('');
  console.log(`JWT_PUBLIC_KEY="${publicKeyEnv}"`);
  console.log('');
  console.log('# Grace period: keep old JWT_SECRET as legacy for accepting existing HS256 tokens');
  console.log('# JWT_LEGACY_HMAC_SECRET=<your-old-JWT_SECRET-value>');
  console.log('');
  console.log('# Remove JWT_LEGACY_HMAC_SECRET after all old tokens have expired (typically 15min + session TTL)');
}

main();
