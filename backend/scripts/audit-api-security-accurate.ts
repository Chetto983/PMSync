/**
 * ACCURATE API Security Audit Script
 * 
 * Properly checks:
 * 1. Controller-level @UseGuards (protects all methods)
 * 2. Method-level @UseGuards (protects specific methods)
 * 3. Rate limiting (@Throttle, @SkipThrottle)
 * 4. Public endpoints (health, auth, webhooks)
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

interface EndpointInfo {
    controller: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    hasAuth: boolean;
    authSource: 'controller' | 'method' | 'none';
    hasRateLimit: boolean;
    rateLimitSource: 'controller' | 'method' | 'global' | 'none';
    isPublicEndpoint: boolean;
    line: number;
}

const controllers = [
    'modules/ai/controllers/ai-health.controller.ts',
    'modules/ai/controllers/ai.controller.ts',
    'modules/ai/controllers/knowledge-base.controller.ts',
    'modules/ai/controllers/personalization.controller.ts',
    'modules/ai/voltagent/controllers/document-library.controller.ts',
    'modules/ai/voltagent/voltagent.controller.ts',
    'modules/analytics/controllers/analytics.controller.ts',
    'modules/auth/controllers/auth.controller.ts',
    'modules/auth/controllers/mfa.controller.ts',
    'modules/calendar/controllers/calendar-webhook.controller.ts',
    'modules/calendar/controllers/calendar.controller.ts',
    'modules/compliance/controllers/gdpr.controller.ts',
    'modules/contacts/controllers/contacts-webhook.controller.ts',
    'modules/contacts/controllers/contacts.controller.ts',
    'modules/email/controllers/attachments.controller.ts',
    'modules/email/controllers/emails.controller.ts',
    'modules/email/controllers/folders.controller.ts',
    'modules/email-sync/controllers/webhook.controller.ts',
    'modules/email-sync/email-sync.controller.ts',
    'modules/health/controllers/health.controller.ts',
    'modules/labels/controllers/labels.controller.ts',
    'modules/providers/controllers/oauth-callback.controller.ts',
    'modules/providers/controllers/providers.controller.ts',
    'modules/tenants/controllers/tenants.controller.ts',
    'modules/users/controllers/users.controller.ts',
];

const endpoints: EndpointInfo[] = [];
const protectedEndpoints: string[] = [];
const unprotectedEndpoints: string[] = [];
const publicEndpoints: string[] = [];

console.log('🔍 Starting ACCURATE API Security Audit...\n');

for (const controllerPath of controllers) {
    const fullPath = join(process.cwd(), 'src', controllerPath);

    try {
        const content = readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');

        let controllerRoute = '';
        let controllerHasAuth = false;
        let controllerHasRateLimit = false;

        // Extract controller route
        const controllerMatch = content.match(/@Controller\(['"]([^'"]+)['"]\)/);
        if (controllerMatch) {
            controllerRoute = controllerMatch[1];
        }

        // Check for CONTROLLER-LEVEL guards - search ENTIRE class decorator section
        // Find the @Controller decorator and the class declaration
        const controllerIndex = content.indexOf('@Controller');
        const classIndex = content.indexOf('export class', controllerIndex);

        if (controllerIndex !== -1 && classIndex !== -1) {
            // Get everything between start of decorators and class declaration
            // Look backwards from @Controller to find start of decorator block
            const linesBeforeController = content.substring(0, controllerIndex).split('\n');
            const decoratorStartLine = Math.max(0, linesBeforeController.length - 20); // Look back 20 lines
            const decoratorStart = linesBeforeController.slice(decoratorStartLine).join('\n');

            // Get everything from potential decorator start to class declaration
            const fullDecoratorSection = decoratorStart + content.substring(controllerIndex, classIndex);

            // Check for guards in this entire section
            controllerHasAuth = fullDecoratorSection.includes('@UseGuards(JwtAuthGuard') ||
                fullDecoratorSection.includes('@UseGuards(TenantGuard');

            controllerHasRateLimit = fullDecoratorSection.includes('@Throttle(');
        }

        // Determine if this is a public controller (health, webhooks, auth)
        const isPublicController = controllerRoute.includes('health') ||
            controllerRoute.includes('webhook') ||
            controllerRoute === 'auth';

        // Find all HTTP method decorators
        const httpMethods = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

        lines.forEach((line, index) => {
            for (const method of httpMethods) {
                const regex = new RegExp(`@${method}\\(['"]?([^'"\\)]*)?['"]?\\)`);
                const match = line.match(regex);

                if (match) {
                    const routePath = match[1] || '';
                    const fullRoute = `/${controllerRoute}${routePath ? '/' + routePath : ''}`;

                    // Check for METHOD-LEVEL auth
                    const methodStart = index;
                    const methodContent = lines.slice(Math.max(0, methodStart - 10), methodStart + 1).join('\n');
                    const hasMethodAuth = methodContent.includes('@UseGuards(JwtAuthGuard') ||
                        methodContent.includes('@UseGuards(TenantGuard');

                    const hasMethodRateLimit = methodContent.includes('@Throttle(') ||
                        methodContent.includes('@SkipThrottle()');

                    // Determine auth status
                    let hasAuth = false;
                    let authSource: 'controller' | 'method' | 'none' = 'none';

                    if (controllerHasAuth) {
                        hasAuth = true;
                        authSource = 'controller';
                    } else if (hasMethodAuth) {
                        hasAuth = true;
                        authSource = 'method';
                    }

                    // Determine rate limit status
                    let hasRateLimit = false;
                    let rateLimitSource: 'controller' | 'method' | 'global' | 'none' = 'none';

                    if (methodContent.includes('@SkipThrottle()')) {
                        hasRateLimit = false;
                        rateLimitSource = 'none';
                    } else if (hasMethodRateLimit) {
                        hasRateLimit = true;
                        rateLimitSource = 'method';
                    } else if (controllerHasRateLimit) {
                        hasRateLimit = true;
                        rateLimitSource = 'controller';
                    }

                    const endpoint: EndpointInfo = {
                        controller: controllerPath.split('/').pop()!.replace('.ts', ''),
                        method: method.toUpperCase() as any,
                        path: fullRoute,
                        hasAuth,
                        authSource,
                        hasRateLimit,
                        rateLimitSource,
                        isPublicEndpoint: isPublicController,
                        line: index + 1,
                    };

                    endpoints.push(endpoint);

                    if (hasAuth) {
                        protectedEndpoints.push(`${method.toUpperCase()} ${fullRoute} (${authSource})`);
                    } else {
                        unprotectedEndpoints.push(`${method.toUpperCase()} ${fullRoute} (${controllerPath}:${index + 1})`);
                    }

                    if (isPublicController) {
                        publicEndpoints.push(`${method.toUpperCase()} ${fullRoute}`);
                    }
                }
            }
        });

    } catch (error: any) {
        console.error(`❌ Error reading ${controllerPath}:`, error.message);
    }
}

// Generate Report
console.log('📊 ACCURATE API Security Audit Report\n');
console.log('='.repeat(80));
console.log(`\n📍 Total Endpoints: ${endpoints.length}`);
console.log(`🔒 Protected Endpoints: ${protectedEndpoints.length} (${Math.round(protectedEndpoints.length / endpoints.length * 100)}%)`);
console.log(`🔓 Unprotected Endpoints: ${unprotectedEndpoints.length} (${Math.round(unprotectedEndpoints.length / endpoints.length * 100)}%)`);
console.log(`🌐 Public Endpoints (health/auth/webhooks): ${publicEndpoints.length}`);
console.log(`🚦 Rate Limited: ${endpoints.filter(e => e.hasRateLimit).length}`);
console.log('\n' + '='.repeat(80));

// Auth Summary
console.log('\n🔒 AUTHENTICATION SUMMARY:');
console.log('-'.repeat(80));
const controllerAuth = endpoints.filter(e => e.authSource === 'controller').length;
const methodAuth = endpoints.filter(e => e.authSource === 'method').length;
const noAuth = endpoints.filter(e => e.authSource === 'none').length;

console.log(`  Controller-level guards: ${controllerAuth} endpoints`);
console.log(`  Method-level guards: ${methodAuth} endpoints`);
console.log(`  No authentication: ${noAuth} endpoints`);

// Unprotected Endpoints (excluding public ones)
const actuallyUnprotected = endpoints.filter(e => !e.hasAuth && !e.isPublicEndpoint);
if (actuallyUnprotected.length > 0) {
    console.log('\n⚠️  NON-PUBLIC UNPROTECTED ENDPOINTS (SECURITY RISK):');
    console.log('-'.repeat(80));
    actuallyUnprotected.forEach(ep => {
        console.log(`  ${ep.method.padEnd(6)} ${ep.path} (${ep.controller}:${ep.line})`);
    });
} else {
    console.log('\n✅ All non-public endpoints are properly protected!');
}

// Public Endpoints
console.log('\n🌐 PUBLIC ENDPOINTS (No Auth Required):');
console.log('-'.repeat(80));
const publicEps = endpoints.filter(e => e.isPublicEndpoint);
publicEps.forEach(ep => {
    const auth = ep.hasAuth ? '🔒' : '🔓';
    console.log(`  ${auth} ${ep.method.padEnd(6)} ${ep.path}`);
});

// Rate Limiting Summary
console.log('\n🚦 RATE LIMITING SUMMARY:');
console.log('-'.repeat(80));
const methodRL = endpoints.filter(e => e.rateLimitSource === 'method').length;
const controllerRL = endpoints.filter(e => e.rateLimitSource === 'controller').length;
const noRL = endpoints.filter(e => e.rateLimitSource === 'none').length;

console.log(`  Method-level: ${methodRL} endpoints`);
console.log(`  Controller-level: ${controllerRL} endpoints`);
console.log(`  No rate limiting: ${noRL} endpoints`);

// Endpoints by Controller
console.log('\n📋 ENDPOINTS BY CONTROLLER:');
console.log('-'.repeat(80));

const byController = endpoints.reduce((acc, ep) => {
    if (!acc[ep.controller]) acc[ep.controller] = [];
    acc[ep.controller].push(ep);
    return acc;
}, {} as Record<string, EndpointInfo[]>);

Object.entries(byController).forEach(([controller, eps]) => {
    const controllerAuth = eps[0].authSource === 'controller';
    const authSymbol = controllerAuth ? '🔒' : '  ';
    console.log(`\n${authSymbol} ${controller} (${eps.length} endpoints)${controllerAuth ? ' - Controller-level auth' : ''}`);
    eps.forEach(ep => {
        const auth = ep.hasAuth ? '🔒' : '🔓';
        const rate = ep.hasRateLimit ? '🚦' : '  ';
        const source = ep.authSource !== 'controller' && ep.hasAuth ? ` (${ep.authSource})` : '';
        console.log(`  ${auth} ${rate} ${ep.method.padEnd(6)} ${ep.path}${source}`);
    });
});

// Security Recommendations
console.log('\n' + '='.repeat(80));
console.log('\n🛡️  SECURITY ASSESSMENT:\n');

if (actuallyUnprotected.length > 0) {
    console.log(`❌ CRITICAL: ${actuallyUnprotected.length} non-public endpoints lack authentication`);
} else {
    console.log('✅ All non-public endpoints are properly protected');
}

if (noRL > endpoints.length * 0.5) {
    console.log(`⚠️  WARNING: ${noRL} endpoints (${Math.round(noRL / endpoints.length * 100)}%) lack rate limiting`);
} else {
    console.log(`✅ Rate limiting coverage: ${Math.round((endpoints.length - noRL) / endpoints.length * 100)}%`);
}

const tenantGuardCount = endpoints.filter(e => {
    const path = `src/${controllers.find(c => c.includes(e.controller))}`;
    try {
        const content = readFileSync(path, 'utf-8');
        return content.includes('TenantGuard');
    } catch {
        return false;
    }
}).length;

console.log(`✅ Tenant isolation: ${tenantGuardCount} endpoints use TenantGuard`);

console.log('\n' + '='.repeat(80));
console.log('\n✅ Audit Complete!\n');

// Export JSON
const report = {
    summary: {
        total: endpoints.length,
        protected: protectedEndpoints.length,
        unprotected: unprotectedEndpoints.length,
        actuallyUnprotected: actuallyUnprotected.length,
        public: publicEndpoints.length,
        rateLimited: endpoints.filter(e => e.hasRateLimit).length,
        controllerAuth,
        methodAuth,
        noAuth,
    },
    endpoints,
    protectedEndpoints,
    unprotectedEndpoints,
    actuallyUnprotected: actuallyUnprotected.map(e => `${e.method} ${e.path}`),
    publicEndpoints,
};

require('fs').writeFileSync(
    join(process.cwd(), 'api-security-audit-accurate.json'),
    JSON.stringify(report, null, 2)
);

console.log('📄 Full report saved to: api-security-audit-accurate.json\n');
