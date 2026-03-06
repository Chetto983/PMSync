require('dotenv').config();
require('ts-node').register({ transpileOnly: true });

// Patch NestApplication.init to trace each step
const nestApp = require('@nestjs/core/nest-application');
const origInit = nestApp.NestApplication.prototype.init;
nestApp.NestApplication.prototype.init = async function() {
  if (this.isInitialized) return this;
  this.applyOptions();
  console.log('[INIT-TRACE] httpAdapter.init...');
  await (this.httpAdapter && this.httpAdapter.init && this.httpAdapter.init());
  console.log('[INIT-TRACE] registerParserMiddleware...');
  const useBodyParser = this.appOptions && this.appOptions.bodyParser !== false;
  if (useBodyParser) this.registerParserMiddleware();
  console.log('[INIT-TRACE] registerModules...');
  await this.registerModules();
  console.log('[INIT-TRACE] registerRouter...');
  await this.registerRouter();
  console.log('[INIT-TRACE] callInitHook...');
  await this.callInitHook();
  console.log('[INIT-TRACE] registerRouterHooks...');
  await this.registerRouterHooks();
  console.log('[INIT-TRACE] callBootstrapHook...');
  await this.callBootstrapHook();
  this.isInitialized = true;
  console.log('[INIT-TRACE] DONE');
  return this;
};

process.env.STARTUP_TRAP_WARN_AFTER_MS = '5000';
process.env.STARTUP_TRAP_REPEAT_MS = '15000';
process.env.STARTUP_TRAP_ABORT_AFTER_MS = '45000';
process.env.STARTUP_TRAP_DISABLE_BUFFER_LOGS = '1';

require('../src/main');
