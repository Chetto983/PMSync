/**
 * Generate OpenAPI Specification from NestJS Application
 *
 * Boots the NestJS application just enough to extract the Swagger/OpenAPI
 * document and writes it to openapi-spec.json for downstream tooling
 * (Spectral linting, openapi-typescript type generation).
 *
 * Usage: npx ts-node scripts/generate-openapi.ts
 *
 * NOTE: This script requires database/Redis connections to boot the app.
 * In CI without a database, use continue-on-error and skip downstream steps.
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import { writeFileSync } from 'fs';

async function generateSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('PMSync API')
    .setDescription('AI-powered multi-tenant email assistant API')
    .setVersion('1.0')
    .addCookieAuth('better-auth.session_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  writeFileSync('openapi-spec.json', JSON.stringify(document, null, 2));

  await app.close();
  console.log('OpenAPI spec written to openapi-spec.json');
}

generateSpec().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err.message || err);
  process.exit(1);
});
