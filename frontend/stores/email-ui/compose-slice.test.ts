import { useEmailUIStore } from '../email-ui-store';

beforeEach(() => {
  useEmailUIStore.getState().reset();
});

describe('compose slice', () => {
  describe('openCompose', () => {
    it('sets compose.isOpen to true with default mode new', () => {
      useEmailUIStore.getState().openCompose();
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
      expect(useEmailUIStore.getState().compose.mode).toBe('new');
    });

    it('sets compose.mode to reply when provided', () => {
      useEmailUIStore.getState().openCompose({ mode: 'reply' });
      expect(useEmailUIStore.getState().compose.mode).toBe('reply');
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
    });
  });

  describe('openReply', () => {
    it('sets isOpen, mode=reply, replyToEmailId', () => {
      useEmailUIStore.getState().openReply('email-1');
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
      expect(useEmailUIStore.getState().compose.mode).toBe('reply');
      expect(useEmailUIStore.getState().compose.replyToEmailId).toBe('email-1');
    });

    it('sets mode=replyAll when replyAll=true', () => {
      useEmailUIStore.getState().openReply('email-1', true);
      expect(useEmailUIStore.getState().compose.mode).toBe('replyAll');
      expect(useEmailUIStore.getState().compose.replyToEmailId).toBe('email-1');
    });
  });

  describe('openForward', () => {
    it('sets mode=forward and replyToEmailId', () => {
      useEmailUIStore.getState().openForward('email-1');
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
      expect(useEmailUIStore.getState().compose.mode).toBe('forward');
      expect(useEmailUIStore.getState().compose.replyToEmailId).toBe('email-1');
    });
  });

  describe('openDraft', () => {
    it('sets mode=draft and draftId', () => {
      useEmailUIStore.getState().openDraft('draft-1');
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
      expect(useEmailUIStore.getState().compose.mode).toBe('draft');
      expect(useEmailUIStore.getState().compose.draftId).toBe('draft-1');
    });
  });

  describe('closeCompose', () => {
    it('resets compose.isOpen to false', () => {
      useEmailUIStore.getState().openCompose();
      useEmailUIStore.getState().closeCompose();
      expect(useEmailUIStore.getState().compose.isOpen).toBe(false);
    });
  });

  describe('updateCompose', () => {
    it('merges updates into compose state', () => {
      useEmailUIStore.getState().openCompose();
      useEmailUIStore.getState().updateCompose({ initialSubject: 'Hi' });
      expect(useEmailUIStore.getState().compose.initialSubject).toBe('Hi');
      expect(useEmailUIStore.getState().compose.isOpen).toBe(true);
    });
  });
});
