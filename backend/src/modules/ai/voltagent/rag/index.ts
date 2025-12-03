/**
 * VoltAgent RAG (Retrieval-Augmented Generation)
 *
 * Modern RAG implementation with best practices:
 * - Hybrid Search: Vector similarity + keyword/lexical search
 * - Query Expansion: Multiple query variations for better recall
 * - Re-ranking: Semantic re-ranking for precision
 * - Multi-source: Emails, documents, notes
 *
 * Available Retrievers:
 * - KnowledgeBaseRetriever: Simple vector-only retrieval
 * - HybridRetriever: Advanced hybrid search with re-ranking (recommended)
 *
 * @see https://www.microsoft.com/en-us/microsoft-cloud/blog/2025/02/04/common-retrieval-augmented-generation-rag-techniques-explained/
 */
export * from './knowledge-base.retriever';
export * from './hybrid-retriever';
