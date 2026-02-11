/**
 * Legal document constants (LEGAL-01, LEGAL-02)
 *
 * Tracks current versions of Terms of Service and Privacy Policy.
 * When a new version is published, bump the version here and
 * LegalAcceptanceGuard will block users who haven't accepted yet.
 */

export const CURRENT_TOS_VERSION = '1.0';
export const CURRENT_PP_VERSION = '1.0';

export type DocumentType = 'TOS' | 'PRIVACY_POLICY';

export interface LegalDocument {
  type: DocumentType;
  version: string;
  label: string;
}

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    type: 'TOS',
    version: CURRENT_TOS_VERSION,
    label: 'Terms of Service',
  },
  {
    type: 'PRIVACY_POLICY',
    version: CURRENT_PP_VERSION,
    label: 'Privacy Policy',
  },
];

/** Valid document types for validation */
export const VALID_DOCUMENT_TYPES: DocumentType[] = ['TOS', 'PRIVACY_POLICY'];

/** Map document type to its current version */
export const CURRENT_VERSIONS: Record<DocumentType, string> = {
  TOS: CURRENT_TOS_VERSION,
  PRIVACY_POLICY: CURRENT_PP_VERSION,
};
