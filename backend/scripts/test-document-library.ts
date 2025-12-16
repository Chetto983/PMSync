/**
 * VoltAgent Document Library Test
 *
 * Tests the Mistral Agents API document_library RAG integration.
 * Creates libraries, uploads documents from S3 bucket, and queries with RAG.
 *
 * Usage: npx ts-node --transpile-only -r tsconfig-paths/register scripts/test-document-library.ts
 */
import { createPrismaClient } from '../src/prisma/prisma-client.factory';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentLibraryService } from '../src/modules/ai/voltagent/services/document-library.service';
import { StorageService } from '../src/modules/email/services/storage.service';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  details?: string;
  error?: string;
}

async function runDocumentLibraryTest() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           VoltAgent Document Library Test                    ║
║           Testing: Mistral Agents API document_library       ║
╚══════════════════════════════════════════════════════════════╝
`);

  const prisma = createPrismaClient();
  const results: TestResult[] = [];

  // Get test user
  const user = await prisma.user.findFirst({
    include: { userPreferences: true },
  });
  if (!user) {
    console.error('❌ No user found in database');
    await prisma.$disconnect();
    return;
  }

  console.log('🧠 User Profile:');
  console.log(`   Name: ${user.firstName} ${user.lastName}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Tenant: ${user.tenantId}`);
  console.log();

  // Bootstrap NestJS
  console.log('🚀 Starting Application...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const documentLibraryService = app.get(DocumentLibraryService);
  const configService = app.get(ConfigService);
  const tenantId = user.tenantId;

  // S3 configuration
  console.log('📦 S3 Configuration:');
  console.log(`   Endpoint: ${configService.get('S3_ENDPOINT')}`);
  console.log(`   Bucket: ${configService.get('S3_BUCKET')}`);
  console.log(`   Mistral API Key: ${configService.get('MISTRAL_API_KEY')?.substring(0, 15)}...`);
  console.log();

  // Create S3 client for listing bucket contents
  const s3Client = new S3Client({
    region: configService.get('S3_REGION', 'us-east-1'),
    endpoint: configService.get('S3_ENDPOINT'),
    forcePathStyle: configService.get('S3_FORCE_PATH_STYLE', true),
    credentials: {
      accessKeyId: configService.get('S3_ACCESS_KEY', ''),
      secretAccessKey: configService.get('S3_SECRET_KEY', ''),
    },
  });

  console.log(`${'═'.repeat(60)}`);
  console.log('📦 S3 BUCKET CONTENTS');
  console.log(`${'─'.repeat(60)}\n`);

  // List S3 bucket contents
  let s3Files: { key: string; size: number }[] = [];
  try {
    const listResponse = await s3Client.send(new ListObjectsV2Command({
      Bucket: configService.get('S3_BUCKET'),
      MaxKeys: 30,
    }));

    s3Files = (listResponse.Contents || [])
      .filter(obj => obj.Key && obj.Size && obj.Size > 0)
      .map(obj => ({ key: obj.Key!, size: obj.Size! }));

    console.log(`Found ${s3Files.length} files in S3 bucket:\n`);
    s3Files.forEach((file, i) => {
      const sizeKB = (file.size / 1024).toFixed(1);
      const isDocument = /\.(pdf|txt|md|doc|docx)$/i.test(file.key);
      console.log(`   ${i + 1}. ${isDocument ? '📄' : '📎'} ${file.key} (${sizeKB} KB)`);
    });
    console.log();
  } catch (error) {
    console.error(`❌ Failed to list S3 bucket: ${error instanceof Error ? error.message : String(error)}`);
  }

  console.log(`${'═'.repeat(60)}`);
  console.log('📚 DOCUMENT LIBRARY TESTS');
  console.log(`${'─'.repeat(60)}\n`);

  // Test 1: Create a document library
  console.log('🧪 Test 1: Create Document Library');
  const startTest1 = Date.now();
  let libraryId: string | null = null;

  try {
    const library = await documentLibraryService.createLibrary(tenantId, {
      name: `Test Library ${Date.now()}`,
      description: 'Test library for document RAG integration',
    });
    libraryId = library.id;
    console.log(`   ✅ Created library: ${library.name}`);
    console.log(`      ID: ${library.id}`);
    results.push({
      name: 'Create Document Library',
      status: 'passed',
      duration: Date.now() - startTest1,
      details: `Library ID: ${library.id}`,
    });
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      name: 'Create Document Library',
      status: 'failed',
      duration: Date.now() - startTest1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.log();

  // Test 2: List libraries
  console.log('🧪 Test 2: List Document Libraries');
  const startTest2 = Date.now();

  try {
    const libraries = await documentLibraryService.listLibraries(tenantId);
    console.log(`   ✅ Found ${libraries.length} libraries:`);
    libraries.forEach(lib => {
      console.log(`      - ${lib.name}: ${lib.documentCount} documents`);
    });
    results.push({
      name: 'List Document Libraries',
      status: 'passed',
      duration: Date.now() - startTest2,
      details: `Found ${libraries.length} libraries`,
    });
  } catch (error) {
    console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      name: 'List Document Libraries',
      status: 'failed',
      duration: Date.now() - startTest2,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  console.log();

  // Test 3: Upload a test document directly
  if (libraryId) {
    console.log('🧪 Test 3: Upload Test Document');
    const startTest3 = Date.now();

    try {
      // Create a test document with useful content
      const testDocumentContent = `
# MailAgent Document Library Test Document

## Overview
This is a test document for the MailAgent Document Library RAG system.
The document library uses Mistral's built-in RAG capabilities for intelligent document search.

## Key Features

### 1. Automatic Document Processing
- Documents are automatically chunked and embedded
- No custom RAG implementation needed
- Supports PDF, TXT, MD, DOC, DOCX formats

### 2. Multi-Library Organization
- Create multiple libraries for different topics
- Search across all libraries or specific ones
- Per-tenant isolation for security

### 3. Citation Support
- Answers include source document references
- Snippets show relevant passages
- Confidence scores for relevance

### 4. Performance
- Agent pooling with 1-hour cache TTL
- Redis-based query caching (15 minutes)
- Memory fallback for high availability

## Technical Details

### API Endpoints
- POST /api/voltagent/documents/libraries - Create library
- GET /api/voltagent/documents/libraries - List libraries
- POST /api/voltagent/documents/libraries/:id/documents - Upload document
- POST /api/voltagent/documents/query - RAG query

### Configuration
- MISTRAL_API_KEY - Required for Mistral API
- DOCUMENT_LIBRARY_S3_BACKUP - Optional S3 backup
- AI_MODEL_MEDIUM - Model for RAG queries

## Example Questions
You can ask questions like:
- "What are the key features of the document library?"
- "How does citation support work?"
- "What file formats are supported?"
- "How is caching implemented?"

---
Document created: ${new Date().toISOString()}
Tenant: Test Document for RAG Integration
`;

      console.log(`   📤 Uploading test document...`);

      const document = await documentLibraryService.uploadDocument(tenantId, {
        libraryId,
        filename: 'mailagent-document-library-guide.md',
        content: Buffer.from(testDocumentContent, 'utf-8'),
        mimeType: 'text/markdown',
      });

      console.log(`   ✅ Uploaded: ${document.filename}`);
      console.log(`      ID: ${document.id}`);
      console.log(`      Status: ${document.status}`);
      console.log(`      Size: ${(document.size / 1024).toFixed(1)} KB`);

      results.push({
        name: 'Upload Test Document',
        status: 'passed',
        duration: Date.now() - startTest3,
        details: `Uploaded ${document.filename}`,
      });

      // Wait for Mistral to process the document
      console.log(`   ⏳ Waiting 10s for Mistral document processing...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        name: 'Upload Test Document',
        status: 'failed',
        duration: Date.now() - startTest3,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    console.log();

    // Test 4: List documents in library
    console.log('🧪 Test 4: List Documents in Library');
    const startTest4 = Date.now();

    try {
      const documents = await documentLibraryService.listDocuments(tenantId, libraryId);
      console.log(`   ✅ Found ${documents.length} documents:`);
      documents.forEach(doc => {
        console.log(`      - ${doc.filename} (${doc.status})`);
      });
      results.push({
        name: 'List Documents in Library',
        status: 'passed',
        duration: Date.now() - startTest4,
        details: `Found ${documents.length} documents`,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        name: 'List Documents in Library',
        status: 'failed',
        duration: Date.now() - startTest4,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    console.log();

    // Test 5: Query documents with RAG
    console.log('🧪 Test 5: Query Documents (RAG)');
    const startTest5 = Date.now();

    try {
      console.log(`   🔍 Query: "What is this document about? Summarize the main points."`);

      const result = await documentLibraryService.queryDocuments(
        tenantId,
        'What is this document about? Summarize the main points.',
        [libraryId],
        'en',
      );

      console.log(`   ✅ Query completed!`);
      console.log(`   📝 Answer: ${result.answer.substring(0, 300)}${result.answer.length > 300 ? '...' : ''}`);
      console.log(`   📚 Sources: ${result.sources.length}`);
      result.sources.forEach(src => {
        console.log(`      - ${src.documentName}: "${src.snippet.substring(0, 50)}..."`);
      });
      console.log(`   📖 Citations: ${result.citations.join(', ') || 'None'}`);
      console.log(`   💾 From Cache: ${result.fromCache}`);

      results.push({
        name: 'Query Documents (RAG)',
        status: 'passed',
        duration: Date.now() - startTest5,
        details: `Answer length: ${result.answer.length} chars, Sources: ${result.sources.length}`,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        name: 'Query Documents (RAG)',
        status: 'failed',
        duration: Date.now() - startTest5,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    console.log();

    // Test 6: Query in Italian
    console.log('🧪 Test 6: Query Documents (Italian RAG)');
    const startTest6 = Date.now();

    try {
      console.log(`   🔍 Query: "Di cosa parla questo documento? Riassumi i punti principali."`);

      const result = await documentLibraryService.queryDocuments(
        tenantId,
        'Di cosa parla questo documento? Riassumi i punti principali.',
        [libraryId],
        'it',
      );

      console.log(`   ✅ Query completed!`);
      console.log(`   📝 Answer: ${result.answer.substring(0, 300)}${result.answer.length > 300 ? '...' : ''}`);
      console.log(`   💾 From Cache: ${result.fromCache}`);

      results.push({
        name: 'Query Documents (Italian RAG)',
        status: 'passed',
        duration: Date.now() - startTest6,
        details: `Answer length: ${result.answer.length} chars`,
      });
    } catch (error) {
      console.error(`   ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        name: 'Query Documents (Italian RAG)',
        status: 'failed',
        duration: Date.now() - startTest6,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    console.log();
  }

  // Summary
  console.log(`${'═'.repeat(60)}`);
  console.log('📊 TEST RESULTS SUMMARY');
  console.log(`${'─'.repeat(60)}\n`);

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  results.forEach(result => {
    const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
    console.log(`   ${icon} ${result.name} (${result.duration}ms)`);
    if (result.details) console.log(`      ${result.details}`);
    if (result.error) console.log(`      Error: ${result.error}`);
  });

  console.log();
  console.log(`   Total: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`   Duration: ${totalDuration}ms`);
  console.log();

  // Cleanup
  console.log('🧹 Note: Test library not deleted. Run manually if needed.');
  console.log();

  await prisma.$disconnect();
  await app.close();
}

runDocumentLibraryTest().catch(console.error);
