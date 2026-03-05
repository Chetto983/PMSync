/**
 * Pre-split characterization test for EmailsController + sub-controllers.
 *
 * Verifies all original route handler methods exist across the
 * controller family (EmailsController, EmailQueryController,
 * EmailCalendarInviteController, EmailActionsController).
 *
 * This is a structural test -- it does NOT test HTTP behavior.
 */
import { EmailsController } from '../emails.controller';
import { EmailQueryController } from '../email-query.controller';
import { EmailCalendarInviteController } from '../email-calendar-invite.controller';
import { EmailActionsController } from '../email-actions.controller';

describe('EmailsController family (pre-split characterization)', () => {
  // Map of method -> controller class that owns it
  const methodOwnership: Record<string, any> = {
    // EmailQueryController
    listEmails: EmailQueryController,
    getStats: EmailQueryController,
    searchEmails: EmailQueryController,

    // EmailsController (core read)
    getConversations: EmailsController,
    getThread: EmailsController,
    getEmail: EmailsController,

    // EmailCalendarInviteController
    getCalendarInvite: EmailCalendarInviteController,
    respondToCalendarInvite: EmailCalendarInviteController,
    sendCalendarInvite: EmailCalendarInviteController,
    cancelCalendarInvite: EmailCalendarInviteController,

    // EmailActionsController
    sendEmail: EmailActionsController,
    replyToEmail: EmailActionsController,
    forwardEmail: EmailActionsController,
    updateEmail: EmailActionsController,
    bulkDelete: EmailActionsController,
    deleteEmail: EmailActionsController,
    saveDraft: EmailActionsController,
    getDraft: EmailActionsController,
    deleteDraft: EmailActionsController,
    bulkUpdateRead: EmailActionsController,
    bulkUpdateStar: EmailActionsController,
    bulkUpdateFlag: EmailActionsController,
    bulkMoveToFolder: EmailActionsController,
    bulkAddLabels: EmailActionsController,
    bulkRemoveLabels: EmailActionsController,
    fetchArchivedEmail: EmailActionsController,
    runTenantCleanup: EmailActionsController,
    getRetentionStats: EmailActionsController,
    runRetentionPolicy: EmailActionsController,
    downloadAttachment: EmailActionsController,
  };

  const allMethods = Object.keys(methodOwnership);

  it('should have all controller classes defined', () => {
    expect(EmailsController).toBeDefined();
    expect(EmailQueryController).toBeDefined();
    expect(EmailCalendarInviteController).toBeDefined();
    expect(EmailActionsController).toBeDefined();
  });

  it.each(allMethods)('should have method: %s on correct controller', (methodName) => {
    const owner = methodOwnership[methodName];
    expect(typeof owner.prototype[methodName]).toBe('function');
  });

  it('should have all 30 original route methods distributed across controllers', () => {
    expect(allMethods.length).toBe(30);
  });
});
