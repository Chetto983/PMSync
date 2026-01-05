const fs = require('fs');
const path = require('path');

// Fix HIGH-4: Google moveMessage missing retry
const googlePath = path.join(__dirname, '../src/modules/email-sync/drivers/google/google.driver.ts');
let googleContent = fs.readFileSync(googlePath, 'utf8');

const originalLineEndings = googleContent.includes('\r\n') ? 'crlf' : 'lf';
googleContent = googleContent.replace(/\r\n/g, '\n');

// Fix moveMessage - wrap the get and modify calls
const oldMoveMessage = `  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Get current labels
    const message = await this.gmail!.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'minimal',
    });`;

const newMoveMessage = `  async moveMessage(messageId: string, targetFolder: string): Promise<void> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // FIX HIGH-4 (2025-01-05): Add retry wrapper - was missing
    // Get current labels
    const message = await this.executeWithRetry(
      () => this.gmail!.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'minimal',
      }),
      'moveMessage:get',
    );`;

googleContent = googleContent.replace(oldMoveMessage, newMoveMessage);

// Fix the modify call in moveMessage
const oldModify = `    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }

  async copyMessage`;

const newModify = `    // FIX HIGH-4 (2025-01-05): Add retry wrapper - was missing
    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: { addLabelIds, removeLabelIds },
      }),
      'moveMessage:modify',
    );
  }

  async copyMessage`;

googleContent = googleContent.replace(oldModify, newModify);

// Fix copyMessage - wrap the modify call
const oldCopyMessage = `  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Gmail doesn't have copy - we add the label instead
    await this.gmail!.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: targetLabelId ? [targetLabelId] : [],
      },
    });

    return messageId; // Same message, just with additional label
  }`;

const newCopyMessage = `  async copyMessage(messageId: string, targetFolder: string): Promise<string> {
    this.ensureConnected();

    const targetLabelId = this.canonicalToGmailLabel(targetFolder);

    // Gmail doesn't have copy - we add the label instead
    // FIX HIGH-4 (2025-01-05): Add retry wrapper - was missing
    await this.executeWithRetry(
      () => this.gmail!.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: targetLabelId ? [targetLabelId] : [],
        },
      }),
      'copyMessage:modify',
    );

    return messageId; // Same message, just with additional label
  }`;

googleContent = googleContent.replace(oldCopyMessage, newCopyMessage);

// Restore line endings
if (originalLineEndings === 'crlf') {
  googleContent = googleContent.replace(/\n/g, '\r\n');
}
fs.writeFileSync(googlePath, googleContent);
console.log('HIGH-4 fix applied to google.driver.ts');

// Fix HIGH-5: Microsoft sendDraft missing retry
const msPath = path.join(__dirname, '../src/modules/email-sync/drivers/microsoft/microsoft.driver.ts');
let msContent = fs.readFileSync(msPath, 'utf8');

const msOriginalLineEndings = msContent.includes('\r\n') ? 'crlf' : 'lf';
msContent = msContent.replace(/\r\n/g, '\n');

// Check if sendDraft exists and wrap it
const oldSendDraft = `  async sendDraft(draftId: string): Promise<void> {
    this.ensureConnected();
    await this.client!.post(\`/me/messages/\${draftId}/send\`);
  }`;

const newSendDraft = `  async sendDraft(draftId: string): Promise<void> {
    this.ensureConnected();
    // FIX HIGH-5 (2025-01-05): Add retry wrapper - critical path was missing retry
    await this.executeWithRetry(
      () => this.client!.post(\`/me/messages/\${draftId}/send\`),
      'sendDraft',
    );
  }`;

msContent = msContent.replace(oldSendDraft, newSendDraft);

// Restore line endings
if (msOriginalLineEndings === 'crlf') {
  msContent = msContent.replace(/\n/g, '\r\n');
}
fs.writeFileSync(msPath, msContent);
console.log('HIGH-5 fix applied to microsoft.driver.ts');
