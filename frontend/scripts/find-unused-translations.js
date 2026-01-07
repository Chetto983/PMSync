#!/usr/bin/env node
/* eslint-disable */
/**
 * Find unused translations in the frontend codebase
 * This script extracts all translation keys from en.ts and searches for their usage
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FRONTEND_DIR = path.join(__dirname, '..');
const LOCALES_DIR = path.join(FRONTEND_DIR, 'locales');
const EN_FILE = path.join(LOCALES_DIR, 'en.ts');

// Read and parse en.ts to extract all keys
function extractTranslationKeys(content) {
  const keys = [];
  const lines = content.split('\n');
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip comments, imports, types
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
      line.startsWith('import') || line.startsWith('export') || line.startsWith('type') ||
      line.startsWith('interface')) {
      continue;
    }

    // Match property definitions
    const propMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(\{|string|')/);
    if (propMatch) {
      const key = propMatch[1];
      if (key && key !== 'locale') {
        stack.push(key);

        // If it's not an object, it's a leaf key
        if (propMatch[2] !== '{') {
          const fullKey = stack.join('.');
          keys.push(fullKey);
        }
      }
    }

    // Handle closing braces
    if (line.includes('}') && stack.length > 0) {
      const closingBraces = (line.match(/}/g) || []).length;
      for (let j = 0; j < closingBraces; j++) {
        stack.pop();
      }
    }
  }

  return keys;
}

// Search for usage of a translation key in the codebase
function searchKeyUsage(key) {
  const parts = key.split('.');
  const searchPatterns = [
    // Direct access: t.email.composer.title
    `t\\.${key.replace(/\./g, '\\.')}`,
    // Optional chaining: t?.email?.composer?.title
    `t\\?\\.${key.replace(/\./g, '\\?\\.')}`,
    // Bracket notation: t['email']['composer']['title']
    ...parts.map((_, i) => {
      const bracketPath = parts.slice(0, i + 1).map(p => `['${p}']`).join('');
      return `t${bracketPath}`;
    }),
  ];

  try {
    // Search in components, pages, lib, hooks directories
    const searchDirs = ['components', 'pages', 'lib', 'hooks'].join(' ');

    for (const pattern of searchPatterns) {
      const cmd = `cd "${FRONTEND_DIR}" && grep -r -l "${pattern}" ${searchDirs} 2>/dev/null || true`;
      const result = execSync(cmd, { encoding: 'utf8' });

      if (result.trim()) {
        return true; // Found usage
      }
    }

    return false; // No usage found
  } catch (error) {
    console.error(`Error searching for key ${key}:`, error.message);
    return false;
  }
}

// Main function
function main() {
  console.log('Reading en.ts...');
  const content = fs.readFileSync(EN_FILE, 'utf8');

  console.log('Extracting translation keys...');
  const keys = extractTranslationKeys(content);
  console.log(`Found ${keys.length} translation keys`);

  console.log('\nSearching for unused translations...\n');

  const unusedKeys = [];
  const usedKeys = [];

  // Group keys by top-level section
  const sections = {};

  for (const key of keys) {
    const section = key.split('.')[0];
    if (!sections[section]) {
      sections[section] = [];
    }
    sections[section].push(key);
  }

  // Check each section
  for (const [section, sectionKeys] of Object.entries(sections)) {
    console.log(`Checking ${section}... (${sectionKeys.length} keys)`);

    for (const key of sectionKeys) {
      const isUsed = searchKeyUsage(key);

      if (isUsed) {
        usedKeys.push(key);
      } else {
        unusedKeys.push(key);
      }
    }
  }

  // Generate report
  console.log('\n\n========================================');
  console.log('UNUSED TRANSLATIONS REPORT');
  console.log('========================================\n');

  console.log(`Total keys: ${keys.length}`);
  console.log(`Used keys: ${usedKeys.length}`);
  console.log(`Unused keys: ${unusedKeys.length}\n`);

  // Group unused keys by section
  const unusedBySection = {};
  for (const key of unusedKeys) {
    const section = key.split('.')[0];
    if (!unusedBySection[section]) {
      unusedBySection[section] = [];
    }
    unusedBySection[section].push(key);
  }

  // Print unused keys by section
  for (const [section, keys] of Object.entries(unusedBySection).sort()) {
    console.log(`\n## ${section.toUpperCase()} (${keys.length} unused)`);
    console.log('─'.repeat(60));

    for (const key of keys.sort()) {
      console.log(`  - ${key}`);
    }
  }

  // Write detailed report to file
  const reportPath = path.join(FRONTEND_DIR, 'scripts', 'unused-translations-report.txt');
  const report = `
UNUSED TRANSLATIONS REPORT
Generated: ${new Date().toISOString()}

SUMMARY
=======
Total translation keys: ${keys.length}
Used keys: ${usedKeys.length}
Unused keys: ${unusedKeys.length}
Unused percentage: ${((unusedKeys.length / keys.length) * 100).toFixed(2)}%

UNUSED KEYS BY SECTION
=====================

${Object.entries(unusedBySection).sort().map(([section, keys]) => `
${section.toUpperCase()} (${keys.length} unused)
${'─'.repeat(60)}
${keys.sort().map(k => `  - ${k}`).join('\n')}
`).join('\n')}
`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n\nDetailed report saved to: ${reportPath}`);
}

main();
