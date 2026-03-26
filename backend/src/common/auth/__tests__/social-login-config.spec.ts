import * as fs from 'fs';
import * as path from 'path';

describe('Social Login Configuration', () => {
  const instanceSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'better-auth.instance.ts'),
    'utf-8',
  );

  it('disables implicit Google sign-up so login does not create a new tenant', () => {
    expect(instanceSource).toMatch(
      /google:\s*\{[\s\S]*?disableImplicitSignUp:\s*true,/,
    );
  });

  it('disables implicit Microsoft sign-up so login does not create a new tenant', () => {
    expect(instanceSource).toMatch(
      /microsoft:\s*\{[\s\S]*?disableImplicitSignUp:\s*true,/,
    );
  });
});
