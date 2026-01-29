/**
 * VoltAgent RAG (Retrieval-Augmented Generation)
 *
 * Modern RAG implementation with best practices:
 * - Hybrid Search: Vector similarity + keyword/lexical search with RRF fusion
 * - Query Expansion: Multiple query variations for better recall
 * - Multi-source: Emails, documents, contacts
 *
 * @see https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/
 */
export * from './unified-retriever';
