export type LocaleKey = 'en' | 'it';
import { appTranslations } from './app-translations';

// Re-export FullCalendar locale utilities
export { allFullCalendarLocales, getFullCalendarLocale } from './fullcalendar-locales';


interface LandingFeature {
  title: string;
  description: string;
  bullets: string[];
}

interface LandingModule {
  eyebrow: string;
  title: string;
  description: string;
  items: string[];
}

interface LandingTranslations {
  hero: {
    eyebrow: string;
    title: string;
    titlePart1: string;
    titleHighlight: string;
    titlePart2: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
  };
  highlights: Array<{ label: string; value: string }>;
  features: LandingFeature[];
  modules: LandingModule[];
  testimonial: {
    quote: string;
    author: string;
    role: string;
  };
  secondaryCta: {
    title: string;
    subtitle: string;
    primaryCta: string;
    secondaryCta: string;
  };
  // Product cards in hero
  productCards: {
    email: { label: string; desc: string };
    calendar: { label: string; desc: string };
    contacts: { label: string; desc: string };
  };
  // Trust indicators in hero
  trustIndicators: {
    soc2: string;
    uptime: string;

  };
  // Features section
  featuresSection: {
    badge: string;
    title: string;
    titleHighlight: string;
    description: string;
    bottomFeatures: {
      aiPowered: { label: string; desc: string };
      security: { label: string; desc: string };
      fast: { label: string; desc: string };
    };
  };
  // Automation/modules section
  automationSection: {
    badge: string;
    title: string;
    titleHighlight: string;
    description: string;
    learnMore: string;
  };
  // Testimonial section
  testimonialSection: {
    badge: string;
    trustedCertified: string;
  };
  // CTA section
  ctaSection: {
    badge: string;
  };
  // Footer
  footer: {
    product: {
      title: string;
      features: string;
      pricing: string;
      integrations: string;
      changelog: string;
    };
    company: {
      title: string;
      about: string;
      blog: string;
      careers: string;
      contact: string;
    };
    resources: {
      title: string;
      documentation: string;
      apiReference: string;
      support: string;
      status: string;
    };
    legal: {
      title: string;
      privacy: string;
      terms: string;
      security: string;
      gdpr: string;
    };
    copyright: string;
    privacyPolicy: string;
    termsOfService: string;
  };
}

interface AuthScreenCopy {
  title: string;
  subtitle: string;
  successTitle?: string;
  successDescription?: string;
  form: {
    emailLabel?: string;
    passwordLabel?: string;
    confirmPasswordLabel?: string;
    otpLabel?: string;
    firstNameLabel?: string;
    firstNamePlaceholder?: string;
    lastNameLabel?: string;
    lastNamePlaceholder?: string;
    agreeToTerms?: string;
    termsOfService?: string;
    and?: string;
    privacyPolicy?: string;
    termsRequired?: string;
    submit: string;
    cta?: string;
  };
  links?: {
    primary: { href: string; label: string };
    secondary?: { href: string; label: string };
  };
  success?: {
    title: string;
    description: string;
    actionLabel: string;
  };
}

interface MfaTranslations {
  title: string;
  subtitle: string;
  enabled: string;
  disabled: string;
  enable: string;
  disable: string;
  totp: {
    title: string;
    subtitle: string;
    setup: {
      title: string;
      step1: string;
      step1Description: string;
      step2: string;
      step2Description: string;
      step3: string;
      step3Description: string;
      manualEntry: string;
      copySecret: string;
      secretCopied: string;
    };
    verify: {
      title: string;
      subtitle: string;
      placeholder: string;
      submit: string;
      invalid: string;
      success: string;
    };
  };
  backupCodes: {
    title: string;
    subtitle: string;
    generate: string;
    regenerate: string;
    regenerateWarning: string;
    download: string;
    copy: string;
    copied: string;
    print: string;
    remaining: string;
    noCodesRemaining: string;
    warning: string;
    verify: {
      title: string;
      subtitle: string;
      placeholder: string;
      submit: string;
      invalid: string;
      success: string;
    };
  };
  trustedDevices: {
    title: string;
    subtitle: string;
    keepSignedIn: string;
    keepSignedInDescription: string;
    current: string;
    lastUsed: string;
    expires: string;
    revoke: string;
    revokeAll: string;
    revokeConfirm: string;
    revokeAllConfirm: string;
    noDevices: string;
    maxDevices: string;
  };
  challenge: {
    title: string;
    subtitle: string;
    useAuthenticator: string;
    useBackupCode: string;
    switchMethod: string;
    trustDevice: string;
  };
  errors: {
    setupFailed: string;
    verifyFailed: string;
    disableFailed: string;
    notEnabled: string;
    alreadyEnabled: string;
  };
  passkeys?: {
    title: string;
    subtitle: string;
    add: string;
    adding: string;
    noPasskeys: string;
    delete: string;
    deleteConfirm: string;
    lastUsed: string;
    synced: string;
    localOnly: string;
    setupSuccess: string;
    setupError: string;
    notSupported: string;
    cancelled: string;
    alreadyRegistered: string;
    loginWithPasskey?: string;
    deviceTypes: {
      touchId: string;
      faceId: string;
      windowsHello: string;
      securityKey: string;
      phone: string;
    };
  };
}

export interface AppTranslations {
  /**
   * Current locale code (e.g., 'en', 'it')
   * Used for AI compose and other locale-aware features
   */
  locale: LocaleKey;

  app: {
    name: string;
    tagline: string;
  };
  nav: {
    product: string;
    features: string;
    automation: string;
    resources: string;
    login: string;
    register: string;
    home: string;
    mail: string;
    calendar: string;
    contacts: string;
    tasks: string;
    analytics: string;
    ai: string;
    settings: string;
    profile: string;
    logout: string;
    account: string;
    notifications: string;
    language: string;
    lightMode: string;
    darkMode: string;
    searchPlaceholder: string;
  };
  common: {
    loading: string;
    getStarted: string;
    contactSales: string;
    signIn: string;
    createAccount: string;
    backToLogin: string;
    continue: string;
    cancel: string;
    send: string;
    compose: string;
    refresh: string;
    refreshing: string;
    saving: string;
    sending: string;
    syncAll: string;
    syncing: string;
    otpPlaceholder: string;
    emailPlaceholder: string;
    passwordPlaceholder: string;
    confirmPasswordPlaceholder: string;
    searchPlaceholder: string;
    genericError: string;
    passwordMismatch: string;
    passwordSameAsOld: string;
    passwordTooShort: string;
    invalidToken: string;
    invalidEmail: string;
    otpCodeLength: string;
    or?: string;
    search: string;
    save: string;
    delete: string;
    edit: string;
    close: string;
    confirm: string;
    yes: string;
    no: string;
    discard: string;
    viewAll: string;
    join: string;
    retry: string;
    user: string;
    version: string;
    allCaughtUp: string;
    noSubject: string;
    unnamedContact: string;
    toggleTheme: string;
    selected: string;
    selectAll: string;
    create?: string;
    rename?: string;
    path?: string;
    provider?: string;
    parent?: string;
    processing?: string;
  };
  timeAgo: {
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
  };
  date: {
    today: string;
    yesterday: string;
    daysAgo: string;
    never: string;
  };
  greetings: {
    morning: string;
    afternoon: string;
    evening: string;
    subtitle: string;
  };
  landing: LandingTranslations;
  auth: {
    login: AuthScreenCopy;
    otp: AuthScreenCopy;
    register: AuthScreenCopy;
    forgotPassword: AuthScreenCopy;
    resetPassword: AuthScreenCopy;
    mfa: MfaTranslations;
  };
  dashboard: {
    index: {
      loading: string;
      redirecting: string;
    };
    home: {
      stats: {
        unreadEmails: string;
        todayEvents: string;
        pendingTasks: string;
        contacts: string;
      };
      sections: {
        upcomingEvents: string;
        upcomingEventsSubtitle: string;
        noEvents: string;
        viewCalendar: string;
        priorityInbox: string;
        priorityInboxSubtitle: string;
        noStarredEmails: string;
        viewAllEmails: string;
        aiInsights: string;
        aiInsightsSubtitle: string;
        smartReplyReady: string;
        aiAssistMessage: string;
        aiAssistMessageSingular: string;
        viewSuggestions: string;
        inboxStatus: string;
        inboxStatusMessage: string;
        quickActions: string;
        analyzeInbox: string;
        smartCompose: string;
        selectEmail: string;
        recentConnections: string;
        recentConnectionsSubtitle: string;
        noRecentContacts: string;
      };
    };
  };
  email: {
    title: string;
    descriptionTemplate: string;
    searchPlaceholder: string;
    noProviders: string;
    selectEmail: string;
    allAccountsLabel: string;
    starredFolderLabel: string;
    quickFilters: {
      title: string;
      unread: string;
      today: string;
      thisWeek: string;
      hasAttachments: string;
      important: string;
    };
    bulkBar: {
      selected: string;
      markUnread: string;
      markRead: string;
      delete: string;
      archive: string;
      selectAll: string;
      clear: string;
      moreActions: string;
      addStar: string;
      removeStar: string;
      addLabels: string;
      moveToFolder: string;
      markImportant: string;
      unmarkImportant: string;
    };
    messages: {
      loadMoreFailed: string;
      markRead: string;
      markReadFailed: string;
      markUnread: string;
      markUnreadFailed: string;
      deleteConfirm: string;
      deleted: string;
      deleteFailed: string;
      starred: string;
      starFailed: string;
      unstarred: string;
      unstarFailed: string;
      labelsAdded: string;
      labelsUpdated: string;
      labelsFailed: string;
      moved: string;
      moveFailed: string;
      loadLabelsFailed: string;
      selectedCount: string;
      move: string;
      emailSent: string;
      markedImportant: string;
      markedImportantFailed: string;
      unmarkedImportant: string;
      unmarkedImportantFailed: string;
      failedToOpenEmail: string;
      syncTriggered: string;
      syncFailed: string;
      trySyncOrFilter: string;
    };
    composer: {
      title: string;
      titleReply: string;
      titleForward: string;
      replyPrefix: string;
      forwardPrefix: string;
      replyQuotedHeader: string;
      forwardedMessageHeader: string;
      from: string;
      to: string;
      toLabel: string;
      toPlaceholder: string;
      cc: string;
      ccLabel: string;
      bcc: string;
      bccLabel: string;
      subject: string;
      subjectLabel: string;
      subjectPlaceholder: string;
      bodyLabel: string;
      bodyPlaceholder: string;
      attachFiles: string;
      removeAttachment: string;
      attachments: string;
      formatting: string;
      undo: string;
      redo: string;
      heading1: string;
      heading2: string;
      heading3: string;
      bold: string;
      italic: string;
      underline: string;
      strikethrough: string;
      bulletList: string;
      numberedList: string;
      quote: string;
      link: string;
      send: string;
      saveDraft: string;
      discard: string;
      sending: string;
      saving: string;
      savedJustNow: string;
      savedMinutesAgo: string;
      savedHoursAgo: string;
      selectProvider: string;
      noProvider: string;
      validationTo: string;
      validationSubject: string;
      sendError: string;
      uploadError: string;
      fileTooLarge: string;
      fileTypeNotAllowed: string;
      totalSizeExceeded: string;
      draftSaved: string;
      discardConfirm: string;
      aiCompose: string;
      aiComposePrompt: string;
      aiComposePlaceholderReply: string;
      aiComposePlaceholderCompose: string;
      aiComposeError: string;
      aiComposeTitle: string;
      aiComposeHelp: string;
      aiComposeConfirm: string;
      aiComposeCancel: string;
      aiComposeToneLabel: string;
      aiComposeToneAuto: string;
      aiComposeVariantLabel: string;
      aiComposeExamples: string;
      aiComposeGenerate: string;
      aiComposePreview: string;
      aiComposeRegenerate: string;
      aiComposeExampleFollowUp: string;
      aiComposeExampleThankYou: string;
      aiComposeExampleRequest: string;
      aiComposeExampleReplyConfirm: string;
      aiComposeExampleReplyDecline: string;
      aiComposeExampleReplyInfo: string;
      aiChatTitle: string;
      aiChatPlaceholder: string;
      aiChatSuggestions: string;
      aiChatPresetImproveClarityLabel: string;
      aiChatPresetImproveClarityPrompt: string;
      aiChatPresetMoreFormalLabel: string;
      aiChatPresetMoreFormalPrompt: string;
      aiChatPresetMoreFriendlyLabel: string;
      aiChatPresetMoreFriendlyPrompt: string;
      aiChatPresetFixGrammarLabel: string;
      aiChatPresetFixGrammarPrompt: string;
      aiChatPresetShortenLabel: string;
      aiChatPresetShortenPrompt: string;
      aiChatPresetAddCtaLabel: string;
      aiChatPresetAddCtaPrompt: string;
      aiChatThinking: string;
      aiChatCopy: string;
      aiChatInsert: string;
      aiChatClear: string;
      aiChatTone: string;
      aiChatGenerating: string;
      aiChatGenerateSubject: string;
      aiChatGeneratingSubject: string;
      aiChatError: string;
      sendNow: string;
      tomorrowMorning: string;
      nextMonday: string;
      pickDateTime: string;
      scheduleSend: string;
    };
    advancedSearch: {
      title: string;
      active: string;
      searchInSubjectBody: string;
      enterKeywords: string;
      fromSender: string;
      senderPlaceholder: string;
      filterBySender: string;
      dateRange: string;
      fromDate: string;
      toDate: string;
      statusFilters: string;
      hasAttachments: string;
      starredOnly: string;
      readStatus: string;
      unreadOnly: string;
      readOnly: string;
      resetAll: string;
      cancel: string;
      search: string;
      standardSearch: string;
      aiSearch: string;
      toRecipient: string;
      recipientPlaceholder: string;
      filterByRecipient: string;
      subject: string;
      subjectPlaceholder: string;
      filterBySubject: string;
      labelsLabel: string;
      labelsPlaceholder: string;
      filterByLabels: string;
      aiSearchDescription: string;
      aiSearchLabel: string;
      aiSearchPlaceholder: string;
      aiSearchHelperText: string;
      aiExamples: string;
      enableAiSearch: string;
    };
    attachment: string;
    ai: {
      smartReplies: {
        title: string;
        generateMore: string;
        tone: string;
        formal: string;
        casual: string;
        technical: string;
        noReplies: string;
        clickToInsert: string;
        generating: string;
      };
      summary: {
        title: string;
        regenerate: string;
        copy: string;
        copied: string;
        keyPoints: string;
        extractedItems: string;
        addToCalendar: string;
        addTask: string;
        noSummary: string;
        generating: string;
      };
      categorization: {
        title: string;
        suggested: string;
        apply: string;
        dismiss: string;
        confidence: string;
      };
    };
    labels: {
      title: string;
      manageLabels: string;
      addLabel: string;
      createLabel: string;
      editLabel: string;
      labelName: string;
      labelNameRequired: string;
      chooseColor: string;
      createButton: string;
      updateButton: string;
      cancelButton: string;
      deleteConfirm: string;
      failedToCreate: string;
      failedToUpdate: string;
      failedToDelete: string;
      noLabels: string;
      noLabelsDescription: string;
      closeButton: string;
      manageLabelsTooltip: string;
      addRemoveLabels: string;
      noLabelsAvailable: string;
      addLabelText: string;
    };
    conversations: {
      title: string;
      noConversations: string;
      noConversationsDescription: string;
      failedToLoad: string;
      loadMore: string;
      loading: string;
      messages: string;
      participants: string;
      yesterday: string;
      retry: string;
    };
    list: {
      loading: string;
      empty: string;
      threads: { singular: string; plural: string };
      inboxLabel: string;
      advancedSearch: string;
      aiSearchPlaceholder: string;
      emailListView: string;
      conversationView: string;
      openSidebar: string;
      markAsRead: string;
      markAsUnread: string;
      archive: string;
    };
    realtime: {
      connecting: string;
      live: string;
      reconnecting: string;
      disconnectedNotice: string;
    };
    empty: {
      defaultTitle: string;
      defaultSubtitle: string;
      trashTitle: string;
      trashSubtitle: string;
      sentTitle: string;
      sentSubtitle: string;
      unreadTitle: string;
      unreadSubtitle: string;
      labelTitle: string;
      labelSubtitle: string;
      inboxTitle: string;
      inboxSubtitle: string;
      starredTitle: string;
      starredSubtitle: string;
      archiveTitle: string;
      archiveSubtitle: string;
      searchTitle: string;
      searchSubtitle: string;
    };
    swipe: {
      delete: string;
      markRead: string;
      markUnread: string;
      archive: string;
    };
    skeleton: {
      loadingEmails: string;
    };
    view: {
      folderLabel: string;
      attachments: string;
      attachmentsWithCount: string;
      attachmentsTooltip: string;
      fetchArchived: string;
      to: string;
      cc: string;
      labels: string;
      date: string;
      message: string;
      messages: string;
      unreadSingle: string;
      unreadPlural: string;
      selectEmail: string;
      expandAll: string;
      collapseRead: string;
      collapseAll: string;
      back: string;
      archive: string;
      more: string;
      download: string;
      preview: string;
      zoomIn: string;
      zoomOut: string;
      rotate: string;
      failedToLoadPreview: string;
      noPreview: string;
      reply: string;
      replyAll: string;
      replyPlaceholder: string;
      forward: string;
      invite: string;
      openFullEditor: string;
      shortcutSend: string;
      shortcutOpenFullEditor: string;
      dragMoveSingle: string;
      dragMoveMultiple: string;
      summaryTitle: string;
      summaryGenerate: string;
      summaryRegenerate: string;
      summaryShow: string;
      summaryHide: string;
      summaryEmpty: string;
      categoriesGenerate: string;
      categoriesLoaded: string;
      categoriesLoading: string;
      smartRepliesTitle: string;
      smartRepliesGenerate: string;
      smartRepliesRegenerate: string;
      smartRepliesLoaded: string;
      smartRepliesLoading: string;
      smartRepliesEmpty: string;
      labelTitle: string;
      labelEmpty: string;
      memoryTitle: string;
      memoryDescription: string;
      memoryPlaceholder: string;
      memoryGenerate: string;
      memoryRegenerate: string;
      memoryLoading: string;
      memoryEmpty: string;
      memoryCopy: string;
      memoryCopied: string;
      memoryUse: string;
      memoryQueryRequired: string;
      memorySourceEmail: string;
      memorySourceDocument: string;
      memoryConfidenceLabel: string;
      memoryConfidenceHigh: string;
      memoryConfidenceMedium: string;
      memoryConfidenceLow: string;
      memoryUnknownSender: string;
      memoryLastQueryPrefix: string;
      memoryCopyError: string;
      memoryError: string;
    };
    actions: {
      syncNow: string;
      runRetention: string;
      compose: string;
    };
  };
  calendar: {
    title: string;
    description: string;
    refreshTooltip: string;
    allCalendars: string;
    clearSelection: string;
    filterTitle: string;
    noProviders: string;
    noProvidersDescription: string;
    loading: string;
    createEvent: string;
    editEvent: string;
    deleteEvent: string;
    deleteConfirm: string;
    eventDetails: string;
    startTime: string;
    endTime: string;
    location: string;
    eventDescription: string;
    attendees: string;
    saveEvent: string;
    cancelEvent: string;
    quickEventPlaceholder: string;
    today: string;
    day: string;
    week: string;
    month: string;
    list: string;
    eventTitle: string;
    eventTitleLabel: string;
    startDateTime: string;
    endDateTime: string;
    calendarLabel: string;
    noProviderAlert: string;
    createEventDialogTitle: string;
    aiInsightsTitle: string;
    aiOptimizeMessage: string;
    openAiAssistant: string;
    noEventsMessage: string;
    failedToCreateEvent: string;
    failedToCreateQuickEvent: string;
    colorUpdated: string;
    failedToUpdateColor: string;
    eventUpdated: string;
    failedToUpdateEvent: string;
    eventDeleted: string;
    failedToDeleteEvent: string;
    validation: {
      titleRequired: string;
      startRequired: string;
      endRequired: string;
      endAfterStart: string;
      duplicateEvent: string;
    };
    changeColor: string;
    attachments: string;
    download: string;
    close: string;
    allDay: string;
    noCalendarsFound: string;
    failedToDownloadAttachment: string;
    invitation: {
      title: string;
      from: string;
      when: string;
      where: string;
      organizer: string;
      attendees: string;
      description: string;
      status: {
        pending: string;
        accepted: string;
        declined: string;
        tentative: string;
        needsAction: string;
        cancelled: string;
        updated: string;
      };
      actions: {
        accept: string;
        decline: string;
        tentative: string;
        addToCalendar: string;
        viewDetails: string;
        downloadIcs: string;
      };
      method: {
        request: string;
        reply: string;
        cancel: string;
        publish: string;
      };
      messages: {
        inviteReceived: string;
        inviteCancelled: string;
        inviteUpdated: string;
        responseSuccess: string;
        responseFailed: string;
        addedToCalendar: string;
        alreadyResponded: string;
      };
      attendeeRole: {
        required: string;
        optional: string;
        chair: string;
      };
      recurrence: {
        daily: string;
        weekly: string;
        monthly: string;
        yearly: string;
        custom: string;
      };
      allDay: string;
      timezone: string;
    };
    ai: {
      scheduling: {
        title: string;
        promptPlaceholder: string;
        suggestedTimes: string;
        youAreFree: string;
        conflict: string;
        bestTime: string;
        eventDetails: string;
        eventTitle: string;
        eventLocation: string;
        eventNotes: string;
        cancel: string;
        createEvent: string;
        generating: string;
        noSlots: string;
        selectSlot: string;
        selectProvider: string;
        errorGenerating: string;
        errorCreating: string;
        locationPlaceholder: string;
        notesPlaceholder: string;
        emptyState: string;
      };
      availability: {
        title: string;
        checking: string;
        available: string;
        busy: string;
        attendees: string;
      };
    };
  };
  tasks: {
    title: string;
    workspace: string;
    allTasks: string;
    today: string;
    custom: string;
    upcoming: string;
    myProjects: string;
    addNewList: string;
    filter: string;
    newTask: string;
    addTaskPlaceholder: string;
    taskDetails: string;
  };
  contacts: {
    title: string;
    description: string;
    searchPlaceholder: string;
    companyPlaceholder: string;
    providerFilterLabel: string;
    allProvidersLabel: string;
    applyFilters: string;
    clearFilters: string;
    filters: string;
    refresh: string;
    sync: string;
    syncing: string;
    syncDisabledTooltip: string;
    new: string;
    newContact: string;
    noContactsFound: string;
    selectContactMessage: string;
    allContacts: string;
    withEmail: string;
    withPhone: string;
    withCompany: string;
    providers: string;
    actions: {
      email: string;
      sendEmail: string;
      call: string;
      schedule: string;
      addNote: string;
      aiInsights: string;
    };
    details: {
      contactInformation: string;
      email: string;
      phone: string;
      company: string;
      location: string;
      lastInteraction: string;
      notAvailable: string;
      syncedFrom: string;
      emailAddresses: string;
      phoneNumbers: string;
      addresses: string;
      professional: string;
      jobTitle: string;
      department: string;
      importantDates: string;
      birthday: string;
      anniversary: string;
      websites: string;
      socialProfiles: string;
      today: string;
      yesterday: string;
      never: string;
      daysAgo: string;
      primary: string;
      custom: string;
      main: string;
      at?: string;
      emailType?: string;
      phoneType?: string;
      addressType?: string;
      websiteType?: string;
    };
    tabs: {
      details: string;
      activity: string;
      notes: string;
    };
    activity: {
      title: string;
      noActivity: string;
    };
    notes: {
      title: string;
      noNotes: string;
      addNote: string;
    };
    list: {
      emptyTitle: string;
      emptyDescription: string;
      loading: string;
      showing: string;
      tableHeaders: {
        name: string;
        email: string;
        phone: string;
        company: string;
        provider: string;
        lastSynced: string;
        actions: string;
      };
    };
    alerts: {
      loadError: string;
      syncSuccess: string;
      syncError: string;
      deleteConfirmTitle: string;
      deleteConfirmDescription: string;
      deleteSuccess: string;
      deleteError: string;
      selectProvider: string;
      failedToSave: string;
      noProvidersConnected: string;
      noProviderSupportsContacts: string;
      syncCompleted: string;
      syncQueueFailed: string;
    };
    createDialog: {
      title: string;
      provider: string;
      name: string;
      email: string;
      company: string;
      jobTitle: string;
      notes: string;
      create: string;
      cancel: string;
      personalInformation: string;
      contactInformation: string;
      professionalInformation: string;
      displayNameHelper: string;
      phoneNumber: string;
      websitePlaceholder: string;
    };
    editDialog: {
      title: string;
      description: string;
      firstName: string;
      lastName: string;
      displayName: string;
      name: string;
      email: string;
      phone: string;
      company: string;
      jobTitle: string;
      notes: string;
      save: string;
      cancel: string;
      success: string;
      error: string;
    };
    edit: string;
    close: string;
  };
  providers: {
    title: string;
    descriptionTemplate: string;
    refresh: string;
    refreshing: string;
    connectedTab: string;
    addTab: string;
    connectedTitle: string;
    connectedDescription: string;
    loading: string;
    googleTitle: string;
    googleDescription: string;
    googleConnect: string;
    googleConnecting: string;
    googleFeatures: {
      description: string;
      feature1: string;
      feature2: string;
      feature3: string;
    };
    microsoftTitle: string;
    microsoftDescription: string;
    microsoftConnect: string;
    microsoftConnecting: string;
    microsoftFeatures: {
      description: string;
      feature1: string;
      feature2: string;
      feature3: string;
    };
    genericTitle: string;
    genericDescription: string;
    genericConnect: string;
    genericFeatures: {
      description: string;
      feature1: string;
      feature2: string;
      feature3: string;
    };
    helpTitle: string;
    helpGoogle: string;
    helpMicrosoft: string;
    helpGeneric: string;
    commonSettingsTitle: string;
    successMessage: string;
    deleteSuccess: string;
    deleteConfirm: string;
    disconnecting: string;
    disconnect: string;
    oauthError: string;
    addProvider: string;
    noProvidersMessage: string;
    badges: {
      default: string;
      active: string;
      inactive: string;
      email: string;
      calendar: string;
      contacts: string;
    };
    lastSynced: string;
    neverSynced: string;
    genericCard: {
      title: string;
      description: string;
      subtitle: string;
      feature1: string;
      feature2: string;
      feature3: string;
      configureButton: string;
      dialogTitle: string;
      dialogSubtitle: string;
      basicInfo: string;
      emailAddress: string;
      displayName: string;
      imapSettings: string;
      imapHost: string;
      imapHostPlaceholder: string;
      port: string;
      username: string;
      password: string;
      useTls: string;
      smtpSettings: string;
      smtpSubtitle: string;
      smtpHost: string;
      smtpHostPlaceholder: string;
      caldavSettings: string;
      enableCalendar: string;
      caldavUrl: string;
      caldavUrlPlaceholder: string;
      cancel: string;
      connecting: string;
      connectProvider: string;
      // Test connection
      testConnection: string;
      testing: string;
      testSuccess: string;
      testFailed: string;
      imapSuccess: string;
      imapFailed: string;
      smtpSuccess: string;
      smtpFailed: string;
      smtpSkipped: string;
      // Provider presets
      presets: string;
      presetsDescription: string;
      selectProvider: string;
      customProvider: string;
      presetApplied: string;
    };
  };
  settings: {
    pageTitle: string;
    layout: { mobileNavLabel: string };
    title: string;
    description: string;
    preferences: string;
    profileTitle: string;
    profileDescription: string;
    firstName: string;
    lastName: string;
    emailReadonly: string;
    saving: string;
    saveChanges: string;
    successMessage: string;
    providersTitle: string;
    providersDescription: string;
    manageProviders: string;
    dangerZoneTitle: string;
    dangerZoneDescription: string;
    dangerZoneWarning: string;
    deleteAccount: string;
    deleting: string;
    deleteConfirm: string;
    sidebarTitle: string;
    sidebarSubtitle: string;
    sections: {
      general: string;
      security: string;
      ai: string;
      accounts: string;
      account: string;
      notifications: string;
    };
    generalPanel: {
      title: string;
      description: string;
      appearanceTitle: string;
      themeLabel: string;
      themeHint: string;
      themeOptions: {
        light: string;
        dark: string;
        system: string;
      };
      languageTitle: string;
      languageLabel: string;
      languageHint: string;
      languageOptions: {
        en: string;
        it: string;
        es: string;
        fr: string;
        de: string;
      };
      timezoneLabel: string;
      timezoneOptions: {
        pst: string;
        est: string;
        gmt: string;
        cet: string;
        jst: string;
      };
      notificationsTitle: string;
      notificationsDescription: string;
      notificationOptions: {
        newEmails: string;
        newEmailsDescription: string;
        calendarReminders: string;
        calendarRemindersDescription: string;
        taskDeadlines: string;
        taskDeadlinesDescription: string;
      };
      reset: string;
      save: string;
    };
    mailAccountsPanel: {
      title: string;
      description: string;
      connectedTitle: string;
      empty: string;
      manage: string;
      add: string;
      refresh: string;
      refreshTooltip: string;
      syncAll: string;
      syncing: string;
      syncConfirm: string;
      syncStarted: string;
      syncFailed: string;
      addTitle: string;
      addDescription: string;
      defaultBadge: string;
      emailBadge: string;
      calendarBadge: string;
      contactsBadge: string;
      lastSyncPrefix: string;
      neverSynced: string;
      connectedProviders: string;
      connectedProvidersSubtitle: string;
      providerTypes: {
        google: string;
        microsoft: string;
        generic: string;
      };
      loadError: string;
      connectSuccess: string;
      connectRedirect: string;
      disconnectSuccess: string;
      saveSuccess: string;
      saveError: string;
      helpTitle: string;
      helpGoogle: string;
      helpMicrosoft: string;
      helpIMAP: string;
      helpCommonSettings: string;
      helpGmail: string;
      helpOutlook: string;
      helpYahoo: string;
    };
    aiPanel: {
      title: string;
      description: string;
      saving: string;
      savePreferences: string;
      openAssistant: string;
      dataManagementTitle: string;
      dataManagementDescription: string;
      clearMemory: string;
      resetLearning: string;
      autoApproveLabel: string;
      autoApproveHint: string;
      featuresTitle: string;
      featuresDescription: string;
      smartRepliesTitle: string;
      summarizationTitle: string;
      schedulingTitle: string;
      personalizationTitle: string;
      personalizationDescription: string;
      roleLabel: string;
      communicationLabel: string;
      responseLengthLabel: string;
      proactivityLabel: string;
      smartReplies: string;
      smartRepliesDescription: string;
      summarization: string;
      summarizationDescription: string;
      scheduling: string;
      schedulingDescription: string;
      save: string;
      // Personalization
      personalization: {
        title: string;
        description: string;
        jobRole: string;
        jobRoleDescription: string;
        jobRoles: {
          EXECUTIVE: string;
          MANAGER: string;
          IC: string;
          FREELANCER: string;
          STUDENT: string;
          SUPPORT: string;
          SALES: string;
          TECHNICAL: string;
        };
        communicationStyle: string;
        communicationStyleDescription: string;
        styles: {
          FORMAL: string;
          CASUAL: string;
          TECHNICAL: string;
        };
        responseLength: string;
        responseLengthDescription: string;
        lengths: {
          CONCISE: string;
          MODERATE: string;
          DETAILED: string;
        };
        proactivity: string;
        proactivityDescription: string;
        proactivityLevels: {
          LOW: string;
          MEDIUM: string;
          HIGH: string;
        };
        autoApprove: string;
        autoApproveDescription: string;
        language: string;
        languageDescription: string;
      };
      actions: {
        title: string;
        description: string;
        viewPendingActions: string;
        clearMemory: string;
        clearMemoryConfirm: string;
        resetLearning: string;
        resetLearningConfirm: string;
      };
    };
    accountPanel: {
      title: string;
      description: string;
      profileTitle: string;
      contactAdmin: string;
      dangerZoneTitle: string;
      dangerZoneDescription: string;
      deleteAccount: string;
      profileInformation: string;
      fullName: string;
      email: string;
      role: string;
      readOnlyNotice: string;
      dangerTitle: string;
      dangerDescription: string;
      deleteCta: string;
      deleteDialogTitle: string;
      deleteDialogDescription: string;
      deleteDialogConfirmLabel: string;
      deleteDialogCancel: string;
      deleteDialogConfirm: string;
      deleteDialogDeleting: string;
      deleteDialogError: string;
    };
    notificationsPanel: {
      title: string;
      description: string;
      emailToggle: string;
      emailTitle: string;
      newEmailsTitle: string;
      newEmailsDesc: string;
      calendarTitle: string;
      calendarDesc: string;
      aiActionsTitle: string;
      aiActionsDesc: string;
      save: string;
    };
  };
  cookies: {
    title: string;
    description: string;
    privacyLink: string;
    customize: string;
    showDetails: string;
    hideDetails: string;
    necessary: {
      title: string;
      description: string;
    };
    analytics: {
      title: string;
      description: string;
    };
    marketing: {
      title: string;
      description: string;
    };
    acceptAll: string;
    rejectAll: string;
    savePreferences: string;
  };
  ai: {
    welcome: string;
    description: string;
    subtitle: string;
    title: string;
    // Direct access for components - duplicates from ai.learning
    activity?: {
      title: string;
      totalActions: string;
      noData: string;
    };
    analyzingSentiment?: string;
    sentimentError?: string;
    sentiment?: string;
    emotion?: string;
    tone?: string;
    intensity?: string;
    churnRisk?: string;
    escalation?: string;
    aspectBreakdown?: string;
    // Additional direct access for AI components
    allClear?: string;
    awaitingApproval?: string;
    highSeverityRequiresReview?: string;
    categorizationFailed?: string;
    suggestedByAi?: string;
    calculatingPriority?: string;
    priorityError?: string;
    priority?: string;
    urgency?: string;
    recommendation?: string;
    factors?: string;
    contributingFactors?: string;
    categories: {
      email: string;
      calendar: string;
      contacts: string;
    };
    examples: {
      email: {
        summarize: string;
        findLastWeek: string;
        draftReply: string;
      };
      calendar: {
        scheduleMeeting: string;
        todayAgenda: string;
        findFreeTime: string;
      };
      contacts: {
        findContact: string;
        addContact: string;
        updateContact: string;
      };
    };
    quickActions: {
      summarizeInbox: string;
      importantEmails: string;
      todaySchedule: string;
      searchContacts: string;
    };
    capabilities: string;
    learningStats: string;
    feedback: string;
    generateSummary: string;
    inputPlaceholder: string;
    thinking: string;
    online: string;
    pendingActions: string;
    pendingActionsHint: string;
    history: string;
    noHistory: string;
    noPendingActions: string;
    approve: string;
    reject: string;
    confidence: string;
    tips: string;
    rateLimitRetrying: string;
    reconnected: string;
    chat: {
      stop: string;
      retry: string;
      clear: string;
      copy: string;
      insert: string;
      error: string;
      errorNetwork: string;
      streaming: string;
      placeholder: string;
      howCanIHelp: string;
      scrollToBottom: string;
    };
    unread: string;
    learned: string;
    summarize: string;
    writingStyleLearning: string;
    writingStyleLearningLow: string;
    writingStyleLearningMedium: string;
    writingStyleLearningHigh: string;
    learning: {
      title: string;
      actionsProcessed: string;
      activity: {
        title: string;
        totalActions: string;
        noData: string;
        approved: string;
      };
      stats: {
        pending: string;
        approved: string;
        executed: string;
        rejected: string;
      };
      // LearningProgressCard specific
      approvalRate?: string;
      successRate?: string;
      totalActions?: string;
      noData?: string;
      actions?: string;
      more?: string;
      highSeverityRequiresReview?: string;
      awaitingApproval: string;
      allClear: string;
      analyzingSentiment: string;
      sentimentError: string;
      sentiment: string;
      emotion: string;
      tone: string;
      intensity: string;
      levelHigh: string;
      levelMedium: string;
      levelLow: string;
      churnRisk: string;
      escalation: string;
      aspectBreakdown: string;
      calculatingPriority: string;
      priorityError: string;
      priority: string;
      urgency: string;
      recommendation: string;
      factors: string;
      contributingFactors: string;
      handleNow: string;
      handleToday: string;
      handleThisWeek: string;
      canWait: string;
      archive: string;
      suggestedByAi: string;
      categorizationFailed: string;
    };
    dismiss: string;
    emailAi: {
      smartReplies: {
        title: string;
        generateMore: string;
        tone: string;
        formal: string;
        casual: string;
        technical: string;
        noReplies: string;
        clickToInsert: string;
        generating: string;
      };
      summary: {
        title: string;
        regenerate: string;
        copy: string;
        copied: string;
        keyPoints: string;
        extractedItems: string;
        addToCalendar: string;
        addTask: string;
        noSummary: string;
        generating: string;
      };
      categorization: {
        title: string;
        suggested: string;
        apply: string;
        dismiss: string;
        confidence: string;
      };
    };
    calendarAi: {
      scheduling: {
        title: string;
        promptPlaceholder: string;
        suggestedTimes: string;
        youAreFree: string;
        conflict: string;
        bestTime: string;
        eventDetails: string;
        eventTitle: string;
        eventLocation: string;
        eventNotes: string;
        cancel: string;
        createEvent: string;
        generating: string;
        noSlots: string;
        selectSlot: string;
        selectProvider: string;
        errorGenerating: string;
        errorCreating: string;
        locationPlaceholder: string;
        notesPlaceholder: string;
        emptyState: string;
      };
      availability: {
        title: string;
        checking: string;
        available: string;
        busy: string;
        attendees: string;
      };
    };
  };
  commandPalette: {
    searchPlaceholder: string;
    navigation: string;
    actions: string;
    recentSearches: string;
    emailResults: string;
    noResults: string;
    pressEnterToSearch: string;
    navigate: string;
    select: string;
    openWith: string;
  };
  errors: {
    notFound: {
      title: string;
      subtitle: string;
      description: string;
      action: string;
    };
    serverError: {
      title: string;
      subtitle: string;
      description: string;
      action: string;
    };
    networkError: string;
    timeoutError: string;
    unauthorized: string;
    forbidden: string;
    sessionExpired: string;
    conflict: string;
    validationError: string;
    tooManyRequests: string;
    badRequest: string;
    processingError: string;
    unknownError: string;
    setupFailed: string;
    verifyFailed: string;
    disableFailed: string;
    notEnabled: string;
    alreadyEnabled: string;
  };
  folders: {
    all: string;
    inbox: string;
    sent: string;
    drafts: string;
    trash: string;
    spam: string;
    archive: string;
    outbox: string;
    starred: string;
    createFolder: string;
    renameFolder: string;
    deleteFolder: string;
    folderName: string;
    enterNewName: string;
    nameRequired: string;
    deleteWarning: string;
    deleteConfirm: string;
    createSubfolder: string;
    moveEmailsHere: string;
    refresh: string;
    systemFolder: string;
    duplicateError: string;
    genericError: string;
  };
}

const translations: Record<LocaleKey, AppTranslations> = appTranslations;

export const resolveLocale = (value?: string | null): LocaleKey => {
  if (value?.toLowerCase().startsWith('it')) {
    return 'it';
  }
  return 'en';
};

export const getTranslations = (value?: string | null): AppTranslations => {
  const locale = resolveLocale(value);
  return translations[locale];
};

export type { LandingFeature, LandingModule, LandingTranslations, AuthScreenCopy };
