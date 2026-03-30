import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('Rate Tier Audit', () => {
  const srcDir = path.resolve(__dirname, '..');

  it('no @Throttle decorator uses the "default" key anywhere in controllers', () => {
    const result = execSync(
      `grep -rn "Throttle.*default\\|default.*Throttle" --include="*.controller.ts" "${srcDir}" || true`,
      { encoding: 'utf-8' },
    );
    // Filter out comments and imports -- only match actual @Throttle({ default: ... }) usage
    const matches = result
      .split('\n')
      .filter(
        (line) =>
          line.includes('@Throttle') &&
          line.includes('default') &&
          !line.trimStart().startsWith('//') &&
          !line.trimStart().startsWith('*'),
      );
    expect(matches).toHaveLength(0);
  });

  it('no orphaned @Throttle imports remain in controllers that only use @RateTierDecorator', () => {
    // Find all controllers that import from @nestjs/throttler
    const result = execSync(
      `grep -rl "import.*@nestjs/throttler" --include="*.controller.ts" "${srcDir}" || true`,
      { encoding: 'utf-8' },
    );
    const files = result.trim().split('\n').filter(Boolean);
    for (const file of files) {
      const content = execSync(`cat "${file}"`, { encoding: 'utf-8' });
      const hasThrottleUsage =
        content.includes('@Throttle(') || content.includes('@SkipThrottle');
      // If file imports from @nestjs/throttler, it should actually use @Throttle() or @SkipThrottle
      if (content.includes("from '@nestjs/throttler'")) {
        expect(hasThrottleUsage).toBe(true);
      }
    }
  });

  it('email-sync destructive endpoints have explicit @RateTierDecorator', () => {
    const controllerPath = path.resolve(
      srcDir,
      'modules/email-sync/email-sync.controller.ts',
    );
    const content = fs.readFileSync(controllerPath, 'utf-8');
    const lines = content.split('\n');

    const destructiveRoutes = ['sync-all', 'queues/:priority/clear'];
    for (const route of destructiveRoutes) {
      const routeIdx = lines.findIndex((l) => l.includes(`'${route}'`));
      expect(routeIdx).toBeGreaterThan(-1);
      // Check a window of 5 lines before and 5 lines after the route decorator
      const surrounding = lines
        .slice(Math.max(0, routeIdx - 5), routeIdx + 6)
        .join('\n');
      expect(surrounding).toContain("@RateTierDecorator('destructive-write')");
    }
  });
});
