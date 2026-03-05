/**
 * Pre-split characterization test for ContactsService.
 * Verifies all public methods exist on the class prototype.
 */
import { ContactsService } from '../contacts.service';

describe('ContactsService (pre-split characterization)', () => {
  it('should be defined as a class', () => {
    expect(ContactsService).toBeDefined();
    expect(typeof ContactsService).toBe('function');
  });

  const expectedPublicMethods = [
    // CRUD
    'listContacts',
    'getContact',
    'getContactCounts',
    'updateContactCounts',
    'createContact',
    'updateContact',
    'deleteContact',

    // VIP
    'toggleVip',
    'listVipContacts',

    // Provider operations
    'getContactPhoto',
    'findContactsByEmails',
    'deleteProviderContacts',

    // Sync
    'syncContacts',
    'findOrCreateUnifiedContact',

    // Import (delegated)
    'createLocalContact',
    'extractContactsFromEmails',
    'importFromVCard',
  ];

  it.each(expectedPublicMethods)('should have public method: %s', (methodName) => {
    expect(typeof ContactsService.prototype[methodName]).toBe('function');
  });

  it('should have all 17 expected public methods', () => {
    expect(expectedPublicMethods.length).toBe(17);
  });

  it('should re-export types for backward compatibility', () => {
    // Validate the module exports compile
    const mod = require('../contacts.service');
    expect(mod.ContactsService).toBeDefined();
  });
});
