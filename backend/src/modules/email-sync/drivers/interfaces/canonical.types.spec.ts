/**
 * Canonical Types Unit Tests
 *
 * Tests the folder mapping logic and helper functions for all providers.
 * These are pure unit tests that don't require network access.
 */

import { describe, it, expect } from '@jest/globals';
import {
  GMAIL_TO_CANONICAL,
  MICROSOFT_WELLKNOWN_TO_CANONICAL,
  IMAP_SPECIAL_USE_TO_CANONICAL,
  IMAP_NAME_HEURISTICS,
  CANONICAL_TO_GMAIL,
  CANONICAL_TO_MICROSOFT,
  folderNameToCanonical,
  gmailLabelToCanonical,
  microsoftWellKnownToCanonical,
  imapSpecialUseToCanonical,
  CanonicalFolderType,
} from './canonical.types';

describe('Canonical Types', () => {
  describe('Gmail Label Mapping', () => {
    it('should map system labels to canonical types', () => {
      expect(GMAIL_TO_CANONICAL['INBOX']).toBe('INBOX');
      expect(GMAIL_TO_CANONICAL['SENT']).toBe('SENT');
      expect(GMAIL_TO_CANONICAL['DRAFT']).toBe('DRAFTS');
      expect(GMAIL_TO_CANONICAL['TRASH']).toBe('TRASH');
      expect(GMAIL_TO_CANONICAL['SPAM']).toBe('SPAM');
      expect(GMAIL_TO_CANONICAL['STARRED']).toBe('STARRED');
      expect(GMAIL_TO_CANONICAL['IMPORTANT']).toBe('IMPORTANT');
    });

    it('should map Gmail categories to canonical types', () => {
      expect(GMAIL_TO_CANONICAL['CATEGORY_PERSONAL']).toBe('PERSONAL');
      expect(GMAIL_TO_CANONICAL['CATEGORY_SOCIAL']).toBe('SOCIAL');
      expect(GMAIL_TO_CANONICAL['CATEGORY_PROMOTIONS']).toBe('PROMOTIONS');
      expect(GMAIL_TO_CANONICAL['CATEGORY_UPDATES']).toBe('UPDATES');
      expect(GMAIL_TO_CANONICAL['CATEGORY_FORUMS']).toBe('FORUMS');
    });

    it('should have reverse mapping for all canonical types', () => {
      expect(CANONICAL_TO_GMAIL['INBOX']).toBe('INBOX');
      expect(CANONICAL_TO_GMAIL['SENT']).toBe('SENT');
      expect(CANONICAL_TO_GMAIL['DRAFTS']).toBe('DRAFT');
      expect(CANONICAL_TO_GMAIL['TRASH']).toBe('TRASH');
      expect(CANONICAL_TO_GMAIL['SPAM']).toBe('SPAM');
    });

    it('should use gmailLabelToCanonical helper', () => {
      expect(gmailLabelToCanonical('INBOX')).toBe('INBOX');
      expect(gmailLabelToCanonical('CATEGORY_SOCIAL')).toBe('SOCIAL');
      expect(gmailLabelToCanonical('Label_123')).toBe('Label_123'); // Unknown returns as-is
    });
  });

  describe('Microsoft wellKnownName Mapping', () => {
    it('should map wellKnownName to canonical types (lowercase)', () => {
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['inbox']).toBe('INBOX');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['sentitems']).toBe('SENT');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['drafts']).toBe('DRAFTS');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['deleteditems']).toBe('TRASH');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['junkemail']).toBe('SPAM');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['archive']).toBe('ARCHIVE');
      expect(MICROSOFT_WELLKNOWN_TO_CANONICAL['outbox']).toBe('OUTBOX');
    });

    it('should have reverse mapping for all canonical types', () => {
      expect(CANONICAL_TO_MICROSOFT['INBOX']).toBe('inbox');
      expect(CANONICAL_TO_MICROSOFT['SENT']).toBe('sentitems');
      expect(CANONICAL_TO_MICROSOFT['DRAFTS']).toBe('drafts');
      expect(CANONICAL_TO_MICROSOFT['TRASH']).toBe('deleteditems');
      expect(CANONICAL_TO_MICROSOFT['SPAM']).toBe('junkemail');
    });

    it('should use microsoftWellKnownToCanonical helper', () => {
      expect(microsoftWellKnownToCanonical('inbox')).toBe('INBOX');
      expect(microsoftWellKnownToCanonical('Inbox')).toBe('INBOX'); // Case insensitive
      expect(microsoftWellKnownToCanonical('INBOX')).toBe('INBOX');
      expect(microsoftWellKnownToCanonical('sentitems')).toBe('SENT');
      expect(microsoftWellKnownToCanonical('unknown')).toBe('unknown'); // Unknown returns as-is
    });
  });

  describe('IMAP Special-Use Mapping (RFC 6154)', () => {
    it('should map RFC 6154 special-use attributes', () => {
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Inbox']).toBe('INBOX');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Sent']).toBe('SENT');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Drafts']).toBe('DRAFTS');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Trash']).toBe('TRASH');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Junk']).toBe('SPAM');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Archive']).toBe('ARCHIVE');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Flagged']).toBe('STARRED');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\Important']).toBe('IMPORTANT');
      expect(IMAP_SPECIAL_USE_TO_CANONICAL['\\All']).toBe('ARCHIVE');
    });

    it('should use imapSpecialUseToCanonical helper', () => {
      expect(imapSpecialUseToCanonical('\\Sent')).toBe('SENT');
      expect(imapSpecialUseToCanonical('\\Junk')).toBe('SPAM');
      expect(imapSpecialUseToCanonical('\\Custom')).toBeUndefined(); // Unknown returns undefined
    });
  });

  describe('IMAP Name Heuristics', () => {
    it('should map common English folder names', () => {
      expect(IMAP_NAME_HEURISTICS['inbox']).toBe('INBOX');
      expect(IMAP_NAME_HEURISTICS['sent']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['sent items']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['sent messages']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['drafts']).toBe('DRAFTS');
      expect(IMAP_NAME_HEURISTICS['draft']).toBe('DRAFTS');
      expect(IMAP_NAME_HEURISTICS['trash']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['deleted items']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['bin']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['spam']).toBe('SPAM');
      expect(IMAP_NAME_HEURISTICS['junk']).toBe('SPAM');
      expect(IMAP_NAME_HEURISTICS['junk e-mail']).toBe('SPAM');
      expect(IMAP_NAME_HEURISTICS['bulk mail']).toBe('SPAM');
      expect(IMAP_NAME_HEURISTICS['archive']).toBe('ARCHIVE');
      expect(IMAP_NAME_HEURISTICS['all mail']).toBe('ARCHIVE');
    });

    it('should map Italian folder names', () => {
      expect(IMAP_NAME_HEURISTICS['posta in arrivo']).toBe('INBOX');
      expect(IMAP_NAME_HEURISTICS['posta inviata']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['bozze']).toBe('DRAFTS');
      expect(IMAP_NAME_HEURISTICS['cestino']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['posta eliminata']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['posta indesiderata']).toBe('SPAM');
      expect(IMAP_NAME_HEURISTICS['archivio']).toBe('ARCHIVE');
    });

    it('should map German folder names', () => {
      expect(IMAP_NAME_HEURISTICS['posteingang']).toBe('INBOX');
      expect(IMAP_NAME_HEURISTICS['gesendet']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['gesendete objekte']).toBe('SENT');
      expect(IMAP_NAME_HEURISTICS['entwürfe']).toBe('DRAFTS');
      expect(IMAP_NAME_HEURISTICS['papierkorb']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['gelöschte objekte']).toBe('TRASH');
      expect(IMAP_NAME_HEURISTICS['junk-e-mail']).toBe('SPAM');
    });
  });

  describe('folderNameToCanonical Helper', () => {
    it('should normalize folder names case-insensitively', () => {
      expect(folderNameToCanonical('INBOX')).toBe('INBOX');
      expect(folderNameToCanonical('Inbox')).toBe('INBOX');
      expect(folderNameToCanonical('inbox')).toBe('INBOX');
      expect(folderNameToCanonical('InBoX')).toBe('INBOX');
    });

    it('should handle sent folder variants', () => {
      expect(folderNameToCanonical('Sent')).toBe('SENT');
      expect(folderNameToCanonical('Sent Items')).toBe('SENT');
      expect(folderNameToCanonical('Sent Messages')).toBe('SENT');
      expect(folderNameToCanonical('Posta inviata')).toBe('SENT');
    });

    it('should handle trash folder variants', () => {
      expect(folderNameToCanonical('Trash')).toBe('TRASH');
      expect(folderNameToCanonical('Deleted Items')).toBe('TRASH');
      expect(folderNameToCanonical('Bin')).toBe('TRASH');
      expect(folderNameToCanonical('Cestino')).toBe('TRASH');
    });

    it('should handle spam folder variants', () => {
      expect(folderNameToCanonical('Spam')).toBe('SPAM');
      expect(folderNameToCanonical('Junk')).toBe('SPAM');
      expect(folderNameToCanonical('Junk E-mail')).toBe('SPAM');
      expect(folderNameToCanonical('Bulk Mail')).toBe('SPAM');
    });

    it('should return UPPERCASE for unknown folders', () => {
      // folderNameToCanonical returns name.toUpperCase() for unknown folders
      expect(folderNameToCanonical('My Custom Folder')).toBe('MY CUSTOM FOLDER');
      expect(folderNameToCanonical('Work')).toBe('WORK');
      expect(folderNameToCanonical('Projects')).toBe('PROJECTS');
    });
  });

  describe('Bidirectional Mapping Consistency', () => {
    it('Gmail: canonical -> gmail -> canonical should be consistent', () => {
      const canonicalTypes: CanonicalFolderType[] = [
        'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'STARRED', 'IMPORTANT',
      ];

      for (const canonical of canonicalTypes) {
        const gmail = CANONICAL_TO_GMAIL[canonical];
        const backToCanonical = GMAIL_TO_CANONICAL[gmail];
        expect(backToCanonical).toBe(canonical);
      }
    });

    it('Microsoft: canonical -> microsoft -> canonical should be consistent', () => {
      const canonicalTypes: CanonicalFolderType[] = [
        'INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'ARCHIVE', 'OUTBOX',
      ];

      for (const canonical of canonicalTypes) {
        const microsoft = CANONICAL_TO_MICROSOFT[canonical];
        const backToCanonical = MICROSOFT_WELLKNOWN_TO_CANONICAL[microsoft];
        expect(backToCanonical).toBe(canonical);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings gracefully', () => {
      expect(folderNameToCanonical('')).toBe('');
    });

    it('should handle whitespace-only strings', () => {
      const result = folderNameToCanonical('   ');
      expect(typeof result).toBe('string');
    });

    it('should handle special characters in folder names (uppercased)', () => {
      // Unknown folders are uppercased
      expect(folderNameToCanonical('Work/Projects')).toBe('WORK/PROJECTS');
      expect(folderNameToCanonical('2023-Emails')).toBe('2023-EMAILS');
      // Note: 'important' matches heuristic
      expect(folderNameToCanonical('Projects!')).toBe('PROJECTS!');
    });
  });
});
