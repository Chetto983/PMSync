/**
 * Test production build memory usage
 *
 * Run: node scripts/test-prod-memory.js
 */

const { spawn } = require('child_process');
const path = require('path');

const distMain = path.join(__dirname, '..', 'dist', 'main.js');

console.log('Starting production build...');
console.log('Path:', distMain);

// Start the production server
const child = spawn('node', [
  '--max-old-space-size=2048',  // Limit to 2GB
  distMain
], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env },
  stdio: ['pipe', 'pipe', 'pipe']
});

let startTime = Date.now();

child.stdout.on('data', (data) => {
  const line = data.toString().trim();
  console.log('[STDOUT]', line);

  // Check if server is ready
  if (line.includes('listening on port') || line.includes('Nest application successfully started')) {
    const elapsed = Date.now() - startTime;
    console.log(`\nServer started in ${elapsed}ms`);
    console.log('Waiting 5s for memory to stabilize...\n');

    setTimeout(() => {
      // Get PID memory
      const { execSync } = require('child_process');
      try {
        const output = execSync(`powershell -Command "Get-Process -Id ${child.pid} | Select-Object WorkingSet64"`, { encoding: 'utf8' });
        const match = output.match(/(\d+)/);
        if (match) {
          const mb = Math.round(parseInt(match[1]) / (1024 * 1024));
          console.log(`\n📊 PRODUCTION MEMORY: ${mb} MB`);
        }
      } catch (e) {
        console.log('Could not get memory:', e.message);
      }

      console.log('\nKilling server...');
      child.kill('SIGTERM');
      process.exit(0);
    }, 5000);
  }
});

child.stderr.on('data', (data) => {
  console.log('[STDERR]', data.toString().trim());
});

child.on('error', (err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  console.log('Process exited with code:', code);
});

// Timeout after 60 seconds
setTimeout(() => {
  console.log('\nTimeout - server did not start in 60s');
  child.kill('SIGTERM');
  process.exit(1);
}, 60000);
