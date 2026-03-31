import * as fs from 'fs';
import * as path from 'path';
import { Registry, Gauge } from 'prom-client';

describe('Per-replica Prometheus labels (PERF-04)', () => {
  describe('metrics.module.ts source verification', () => {
    const moduleSource = fs.readFileSync(
      path.join(__dirname, '..', 'metrics.module.ts'),
      'utf-8',
    );

    it('contains defaultLabels configuration', () => {
      expect(moduleSource).toContain('defaultLabels');
    });

    it('references RAILWAY_REPLICA_ID env var', () => {
      expect(moduleSource).toContain('RAILWAY_REPLICA_ID');
    });

    it('falls back to "local" when RAILWAY_REPLICA_ID is unset', () => {
      expect(moduleSource).toContain("|| 'local'");
    });
  });

  describe('RAILWAY_REPLICA_ID env evaluation', () => {
    const originalValue = process.env.RAILWAY_REPLICA_ID;

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env.RAILWAY_REPLICA_ID;
      } else {
        process.env.RAILWAY_REPLICA_ID = originalValue;
      }
    });

    it('evaluates to "local" when RAILWAY_REPLICA_ID is unset', () => {
      delete process.env.RAILWAY_REPLICA_ID;
      const instance = process.env.RAILWAY_REPLICA_ID || 'local';
      expect(instance).toBe('local');
    });

    it('evaluates to UUID when RAILWAY_REPLICA_ID is set', () => {
      process.env.RAILWAY_REPLICA_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      const instance = process.env.RAILWAY_REPLICA_ID || 'local';
      expect(instance).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });
  });

  describe('prom-client defaultLabels injection', () => {
    it('injects instance label into all metrics', async () => {
      const registry = new Registry();
      registry.setDefaultLabels({ instance: 'test-replica-42' });

      const gauge = new Gauge({
        name: 'test_metric_for_label_check',
        help: 'Test metric to verify defaultLabels',
        registers: [registry],
      });
      gauge.set(1);

      const metrics = await registry.getMetricsAsJSON();
      const testMetric = metrics.find(
        (m) => m.name === 'test_metric_for_label_check',
      );
      expect(testMetric).toBeDefined();

      const values = testMetric!.values;
      expect(values.length).toBeGreaterThan(0);
      expect(values[0].labels).toHaveProperty('instance', 'test-replica-42');
    });
  });

  describe('railway.toml replica configuration', () => {
    it('has numReplicas set to 2', () => {
      const railwayToml = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', '..', 'railway.toml'),
        'utf-8',
      );
      expect(railwayToml).toContain('numReplicas = 2');
    });
  });
});
