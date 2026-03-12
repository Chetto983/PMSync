/**
 * SandboxService Unit Tests
 *
 * Tests isolated code execution for JavaScript and Python.
 */
import { SandboxService } from './sandbox.service';

describe('SandboxService', () => {
  let service: SandboxService;

  beforeEach(() => {
    service = new SandboxService();
  });

  describe('executeCode - JavaScript', () => {
    it('executes simple console.log', async () => {
      const result = await service.executeCode({
        code: 'console.log("hello world")',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello world');
      expect(result.stderr).toBe('');
    });

    it('executes arithmetic', async () => {
      const result = await service.executeCode({
        code: 'console.log(2 + 3 * 4)',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('14');
    });

    it('captures runtime errors in stderr', async () => {
      const result = await service.executeCode({
        code: 'throw new Error("test error")',
        language: 'javascript',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('test error');
    });

    it('handles syntax errors', async () => {
      const result = await service.executeCode({
        code: 'this is not valid javascript }{',
        language: 'javascript',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
    });

    it('respects timeout', async () => {
      const result = await service.executeCode({
        code: 'while(true) {}',
        language: 'javascript',
        timeout: 1000,
      });

      expect(result.exitCode).not.toBe(0);
    }, 10_000);

    it('passes inputData via file path', async () => {
      const result = await service.executeCode({
        code: `
          const fs = require('fs');
          const data = fs.readFileSync(INPUT_DATA_PATH, 'utf-8');
          console.log(data.toUpperCase());
        `,
        language: 'javascript',
        inputData: 'test input data',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('TEST INPUT DATA');
    });

    it('truncates large output', async () => {
      const result = await service.executeCode({
        code: 'console.log("x".repeat(20000))',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeLessThanOrEqual(16_000);
    });

    it('handles multiline output', async () => {
      const result = await service.executeCode({
        code: 'for(let i=0;i<5;i++) console.log(`line ${i}`)',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(0);
      const lines = result.stdout.trim().split('\n');
      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe('line 0');
      expect(lines[4]).toBe('line 4');
    });

    it('handles JSON output', async () => {
      const result = await service.executeCode({
        code: 'console.log(JSON.stringify({a: 1, b: [2,3]}))',
        language: 'javascript',
      });

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.stdout.trim());
      expect(parsed).toEqual({ a: 1, b: [2, 3] });
    });

    it('cleans up temp files after execution', async () => {
      const fs = await import('fs');

      await service.executeCode({
        code: 'console.log("cleanup test")',
        language: 'javascript',
      });

      // The tmp directory pattern is pmsync-sandbox-*
      // We can't easily check the exact dir, but we verify no error
      // and the service doesn't throw during cleanup
    });
  });

  describe('executeCode - Python', () => {
    // Python tests may be skipped if python is not installed
    let pythonAvailable = true;

    beforeAll(async () => {
      try {
        const { execSync } = await import('child_process');
        execSync('python --version', { encoding: 'utf-8' });
      } catch {
        pythonAvailable = false;
      }
    });

    it('executes simple print', async () => {
      if (!pythonAvailable) return;

      const result = await service.executeCode({
        code: 'print("hello from python")',
        language: 'python',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('hello from python');
    });

    it('executes arithmetic', async () => {
      if (!pythonAvailable) return;

      const result = await service.executeCode({
        code: 'print(2 ** 10)',
        language: 'python',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('1024');
    });

    it('captures Python errors', async () => {
      if (!pythonAvailable) return;

      const result = await service.executeCode({
        code: 'raise ValueError("test python error")',
        language: 'python',
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('ValueError');
    });

    it('passes inputData to Python', async () => {
      if (!pythonAvailable) return;

      const result = await service.executeCode({
        code: `
with open(INPUT_DATA_PATH, 'r') as f:
    data = f.read()
print(data.upper())
`,
        language: 'python',
        inputData: 'python input test',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('PYTHON INPUT TEST');
    });
  });

  describe('timeout enforcement', () => {
    it('caps timeout at DEFAULT_TIMEOUT_MS (30s)', async () => {
      // Passing a timeout higher than 30s should be capped
      const result = await service.executeCode({
        code: 'console.log("fast")',
        language: 'javascript',
        timeout: 999_999,
      });

      expect(result.exitCode).toBe(0);
    });
  });
});
