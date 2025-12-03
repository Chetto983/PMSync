import {
  AgentActionType,
  ActionSeverity,
  ActionStatus,
  AgentName,
  JobRole,
  CompanySize,
  CommunicationStyle,
  ResponseLength,
  ProactivityLevel,
  NotificationFrequency,
  ProviderType,
  LabelType,
  FolderSpecialUse,
  EventStatus,
  EventVisibility,
  EmailTone,
  SupportedLocales,
  Theme,
  EmailDensity,
  WorkingDays,
} from './constants';

describe('AgentActionType', () => {
  it('should have email action types', () => {
    expect(AgentActionType.SEND_EMAIL).toBe('SEND_EMAIL');
    expect(AgentActionType.REPLY_EMAIL).toBe('REPLY_EMAIL');
    expect(AgentActionType.FORWARD_EMAIL).toBe('FORWARD_EMAIL');
    expect(AgentActionType.ARCHIVE_EMAIL).toBe('ARCHIVE_EMAIL');
    expect(AgentActionType.DELETE_EMAIL).toBe('DELETE_EMAIL');
  });

  it('should have calendar action types', () => {
    expect(AgentActionType.CREATE_EVENT).toBe('CREATE_EVENT');
    expect(AgentActionType.UPDATE_EVENT).toBe('UPDATE_EVENT');
    expect(AgentActionType.DELETE_EVENT).toBe('DELETE_EVENT');
    expect(AgentActionType.SCHEDULE_MEETING).toBe('SCHEDULE_MEETING');
  });

  it('should have contact action types', () => {
    expect(AgentActionType.CREATE_CONTACT).toBe('CREATE_CONTACT');
    expect(AgentActionType.UPDATE_CONTACT).toBe('UPDATE_CONTACT');
    expect(AgentActionType.MERGE_CONTACTS).toBe('MERGE_CONTACTS');
  });
});

describe('ActionSeverity', () => {
  it('should have all severity levels', () => {
    expect(ActionSeverity.LOW).toBe('LOW');
    expect(ActionSeverity.MEDIUM).toBe('MEDIUM');
    expect(ActionSeverity.HIGH).toBe('HIGH');
  });
});

describe('ActionStatus', () => {
  it('should have all status values', () => {
    expect(ActionStatus.PENDING).toBe('PENDING');
    expect(ActionStatus.APPROVED).toBe('APPROVED');
    expect(ActionStatus.EXECUTED).toBe('EXECUTED');
    expect(ActionStatus.REJECTED).toBe('REJECTED');
    expect(ActionStatus.EXPIRED).toBe('EXPIRED');
    expect(ActionStatus.FAILED).toBe('FAILED');
  });
});

describe('AgentName', () => {
  it('should have all agent names', () => {
    expect(AgentName.ROUTER).toBe('RouterAgent');
    expect(AgentName.EMAIL).toBe('EmailAgent');
    expect(AgentName.CALENDAR).toBe('CalendarAgent');
    expect(AgentName.CONTACTS).toBe('ContactsAgent');
    expect(AgentName.SUPERVISOR).toBe('SupervisorAgent');
  });
});

describe('User Preferences Constants', () => {
  it('should have JobRole values', () => {
    expect(JobRole.EXECUTIVE).toBe('EXECUTIVE');
    expect(JobRole.MANAGER).toBe('MANAGER');
    expect(JobRole.IC).toBe('IC');
    expect(JobRole.FREELANCER).toBe('FREELANCER');
    expect(JobRole.STUDENT).toBe('STUDENT');
    expect(JobRole.OTHER).toBe('OTHER');
  });

  it('should have CompanySize values', () => {
    expect(CompanySize.SOLO).toBe('SOLO');
    expect(CompanySize.STARTUP).toBe('STARTUP');
    expect(CompanySize.SMB).toBe('SMB');
    expect(CompanySize.ENTERPRISE).toBe('ENTERPRISE');
  });

  it('should have CommunicationStyle values', () => {
    expect(CommunicationStyle.FORMAL).toBe('FORMAL');
    expect(CommunicationStyle.CASUAL).toBe('CASUAL');
    expect(CommunicationStyle.TECHNICAL).toBe('TECHNICAL');
    expect(CommunicationStyle.CREATIVE).toBe('CREATIVE');
  });

  it('should have ResponseLength values', () => {
    expect(ResponseLength.BRIEF).toBe('BRIEF');
    expect(ResponseLength.MODERATE).toBe('MODERATE');
    expect(ResponseLength.DETAILED).toBe('DETAILED');
  });

  it('should have ProactivityLevel values', () => {
    expect(ProactivityLevel.LOW).toBe('LOW');
    expect(ProactivityLevel.MEDIUM).toBe('MEDIUM');
    expect(ProactivityLevel.HIGH).toBe('HIGH');
  });

  it('should have NotificationFrequency values', () => {
    expect(NotificationFrequency.IMMEDIATE).toBe('IMMEDIATE');
    expect(NotificationFrequency.DIGEST).toBe('DIGEST');
    expect(NotificationFrequency.MINIMAL).toBe('MINIMAL');
  });
});

describe('ProviderType', () => {
  it('should have all provider types', () => {
    expect(ProviderType.GOOGLE).toBe('google');
    expect(ProviderType.MICROSOFT).toBe('microsoft');
    expect(ProviderType.GENERIC).toBe('generic');
  });
});

describe('LabelType', () => {
  it('should have label types', () => {
    expect(LabelType.SYSTEM).toBe('SYSTEM');
    expect(LabelType.USER).toBe('USER');
  });
});

describe('FolderSpecialUse', () => {
  it('should have all special use flags', () => {
    expect(FolderSpecialUse.INBOX).toBe('\\Inbox');
    expect(FolderSpecialUse.SENT).toBe('\\Sent');
    expect(FolderSpecialUse.DRAFTS).toBe('\\Drafts');
    expect(FolderSpecialUse.TRASH).toBe('\\Trash');
    expect(FolderSpecialUse.SPAM).toBe('\\Spam');
    expect(FolderSpecialUse.ALL).toBe('\\All');
    expect(FolderSpecialUse.ARCHIVE).toBe('\\Archive');
    expect(FolderSpecialUse.FLAGGED).toBe('\\Flagged');
  });
});

describe('EventStatus', () => {
  it('should have calendar event statuses', () => {
    expect(EventStatus.CONFIRMED).toBe('confirmed');
    expect(EventStatus.TENTATIVE).toBe('tentative');
    expect(EventStatus.CANCELLED).toBe('cancelled');
  });
});

describe('EventVisibility', () => {
  it('should have event visibility options', () => {
    expect(EventVisibility.DEFAULT).toBe('default');
    expect(EventVisibility.PUBLIC).toBe('public');
    expect(EventVisibility.PRIVATE).toBe('private');
    expect(EventVisibility.CONFIDENTIAL).toBe('confidential');
  });
});

describe('EmailTone', () => {
  it('should have email tone options', () => {
    expect(EmailTone.FORMAL).toBe('formal');
    expect(EmailTone.CASUAL).toBe('casual');
    expect(EmailTone.TECHNICAL).toBe('technical');
  });
});

describe('SupportedLocales', () => {
  it('should have supported locale codes', () => {
    expect(SupportedLocales.EN).toBe('en');
    expect(SupportedLocales.IT).toBe('it');
  });
});

describe('Theme', () => {
  it('should have theme options', () => {
    expect(Theme.LIGHT).toBe('light');
    expect(Theme.DARK).toBe('dark');
    expect(Theme.SYSTEM).toBe('system');
  });
});

describe('EmailDensity', () => {
  it('should have email density options', () => {
    expect(EmailDensity.COMPACT).toBe('compact');
    expect(EmailDensity.COMFORTABLE).toBe('comfortable');
    expect(EmailDensity.SPACIOUS).toBe('spacious');
  });
});

describe('WorkingDays', () => {
  it('should have all working days', () => {
    expect(WorkingDays.MON).toBe('MON');
    expect(WorkingDays.TUE).toBe('TUE');
    expect(WorkingDays.WED).toBe('WED');
    expect(WorkingDays.THU).toBe('THU');
    expect(WorkingDays.FRI).toBe('FRI');
    expect(WorkingDays.SAT).toBe('SAT');
    expect(WorkingDays.SUN).toBe('SUN');
  });
});

// Test that constants are readonly (type-level test)
describe('Constants immutability', () => {
  it('constants should be typed as const', () => {
    // TypeScript should enforce these as readonly
    // This is a runtime check that values exist
    const allConstants = [
      AgentActionType,
      ActionSeverity,
      ActionStatus,
      AgentName,
      JobRole,
      CompanySize,
      CommunicationStyle,
      ResponseLength,
      ProactivityLevel,
      NotificationFrequency,
      ProviderType,
      LabelType,
      FolderSpecialUse,
      EventStatus,
      EventVisibility,
      EmailTone,
      SupportedLocales,
      Theme,
      EmailDensity,
      WorkingDays,
    ];

    allConstants.forEach((constant) => {
      expect(typeof constant).toBe('object');
      expect(Object.keys(constant).length).toBeGreaterThan(0);
    });
  });
});
