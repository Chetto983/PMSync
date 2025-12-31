const fs = require('fs');
const path = 'd:/MailAgent/backend/src/modules/ai/voltagent/memory/long-term-memory.service.ts';

let content = fs.readFileSync(path, 'utf8');

// Replace MEM0_ENABLED check with simpler version that enables by default
const oldCode = `const mem0Enabled = this.configService.get<string>('MEM0_ENABLED', 'false');

    if (mem0Enabled !== 'true') {
      this.logger.warn('Long-term memory disabled by configuration (MEM0_ENABLED != true)');
      return;
    }`;

const newCode = `// Long-term memory enabled by default (custom implementation)
    // Optionally disable with LONG_TERM_MEMORY_ENABLED=false
    const memoryDisabled = this.configService.get<string>('LONG_TERM_MEMORY_ENABLED', 'true') === 'false';
    if (memoryDisabled) {
      this.logger.warn('Long-term memory disabled by configuration (LONG_TERM_MEMORY_ENABLED=false)');
      return;
    }`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(path, content);
    console.log('SUCCESS: Updated onModuleInit to enable by default');
} else {
    console.log('WARNING: Old code pattern not found - may already be updated or format differs');
    console.log('Searching for MEM0_ENABLED...');
    if (content.includes('MEM0_ENABLED')) {
        console.log('Found MEM0_ENABLED - doing broader replacement');
        content = content.replace(/const mem0Enabled[\s\S]*?return;\s*\}\s*\n/m, newCode + '\n\n    ');
        fs.writeFileSync(path, content);
        console.log('SUCCESS: Replaced MEM0 check');
    } else {
        console.log('MEM0_ENABLED not found - already updated');
    }
}
