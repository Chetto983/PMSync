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
  socialProof: {
    trustedBy: string;
    logoNames: string[];
    caseStudy: string;
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
  verificationNotice?: string;
  accountNotFoundNotice?: string;
  successTitle?: string;
  successDescription?: string;
  successAction?: string;
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
  capsLockWarning?: string;
  missingToken?: string;
  requestNewLink?: string;
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
    crmAccounts: string;
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
    skipToContent: string;
    loading: string;
    getStarted: string;
    contactSales: string;
    signIn: string;
    createAccount: string;
    backToLogin: string;
    continue: string;
    cancel: string;
    apply: string;
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
    showPassword: string;
    hidePassword: string;
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
    showMore: string;
    showLess: string;
    fullscreen: string;
    exitFullscreen: string;
    confirm: string;
    yes: string;
    no: string;
    discard: string;
    undo: string;
    viewAll: string;
    join: string;
    retry: string;
    retryLoading: string;
    user: string;
    version: string;
    separatorDot: string;
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
    success?: string;
    syncStarted?: string;
    syncInProgress?: string;
    syncCompleted?: string;
    syncFailed?: string;
    syncProgress?: string;
    overdue?: string;
    today?: string;
    tomorrow?: string;
    remaining?: string;
    started?: string;
    done?: string;
    all?: string;
    providerConnectError?: string;
    providerConnectSuccess?: string;
    offlineBanner?: string;
    rowsPerPage?: string;
    displayedRows?: string;
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
    social: {
      google: string;
      microsoft: string;
      or: string;
    };
    verifyEmail?: {
      title: string;
      subtitle: string;
      verifying: string;
      successTitle: string;
      successDescription: string;
      goToDashboard: string;
      errorTitle: string;
      failed: string;
      resend: string;
      resendDescription: string;
      resendSuccess: string;
      resendButton: string;
      emailLabel: string;
    };
    twoFactorVerify: {
      title: string;
      subtitle: string;
      codeLabel: string;
      codePlaceholder: string;
      verify: string;
      useBackupCode: string;
      backupCodeLabel: string;
      backupCodePlaceholder: string;
      useAuthenticator: string;
      error: string;
    };
    mfa: MfaTranslations;
  };
  dashboard: {
    title: string;
    subtitle?: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyCta?: string;
    customize?: {
      description: string;
    };
    empty?: {
      title: string;
      description: string;
    };
    actions: {
      customize: string;
      doneEditing: string;
      addWidget: string;
      layouts: string;
      save: string;
      reset: string;
    };
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
        viewStarredEmails: string;
        priorityEmails: string;
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
    widgets: {
      briefing: {
        title: string;
        dismiss: string;
        showDetails: string;
        refresh: string;
        noItems: string;
        urgentEmails: string;
        urgentEmailsPlural: string;
        deadlines: string;
        deadlinesPlural: string;
        followUps: string;
        followUpsPlural: string;
        staleContacts: string;
        staleContactsPlural: string;
        today: string;
        todaysHighlights: string;
        defaultSummary?: string;
        urgent?: string;
        highlights?: string;
      };
      deadlines: {
        title: string;
        subtitle: string;
        noDeadlines: string;
        noUpcoming: string;
        overdue: string;
        dueToday: string;
        dueTomorrow: string;
        dueIn: string;
        dueSoon: string;
        hoursLeft: string;
        viewAll: string;
        priority: {
          high: string;
          medium: string;
          low: string;
        };
      };
      followUps: {
        title: string;
        subtitle: string;
        subtitleWithOverdue: string;
        noPending: string;
        overdue: string;
        today: string;
        yesterday: string;
        daysAgo: string;
        weeksAgo: string;
        viewAll: string;
        noResponse: string;
      };
      crm: {
        title: string;
        subtitle: string;
        subtitlePlural: string;
        avgScore: string;
        allActive: string;
        greatJob: string;
        reconnect: string;
        viewAll: string;
        lastContact: string;
        monthAgo: string;
        monthsAgo: string;
        yearAgo: string;
        yearsAgo: string;
        daysAgo: string;
        frequencyDaily: string;
        frequencyWeekly: string;
        frequencyMonthly: string;
        frequencyOccasional: string;
        trendDecreasing: string;
        trendStable: string;
        trendIncreasing: string;
        interactions: string;
        score: string;
      };
      unreadEmails: {
        title: string;
        noSubject: string;
        allCaughtUp: string;
      };
      priorityInbox: {
        title: string;
        subtitle: string;
        noSubject: string;
        empty: string;
        emptyDescription: string;
        viewAll: string;
        urgent: string;
        important: string;
      };
      aiTriage: {
        title: string;
        subtitle: string;
        noSubject: string;
        empty: string;
        emptyDescription: string;
        viewAll: string;
        priority: {
          critical: string;
          high: string;
          medium: string;
          low: string;
          minimal: string;
        };
      };
      todayEvents: {
        title: string;
        noEvents: string;
      };
      trendCharts: {
        title: string;
        subtitle: string;
        received: string;
        sent: string;
        total: string;
        noData: string;
      };
      common: {
        refreshWidget: string;
        noItems: string;
        today: string;
        overdue: string;
        retry: string;
        showDetails: string;
      };
      insights: {
        title: string;
        subtitle: string;
        urgentEmails: string;
        urgentEmailsDesc: string;
        overdueDeadlines: string;
        overdueDeadlinesDesc: string;
        todayDeadlines: string;
        todayDeadlinesDesc: string;
        overdueFollowUps: string;
        overdueFollowUpsDesc: string;
        staleContacts: string;
        staleContactsDesc: string;
        allClear: string;
        allClearDesc: string;
      };
      categories: {
        all: string;
        email: string;
        calendar: string;
        ai: string;
        crm: string;
        analytics: string;
        actions: string;
        productivity: string;
      };
      addWidget: string;
      searchPlaceholder: string;
      addAnother: string;
      addToDashboard: string;
      noResults: string;
    };
  };
  email: {
    title: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyCta?: string;
    descriptionTemplate: string;
    searchPlaceholder: string;
    search: {
      placeholder: string;
      filters: {
        from: string;
        to: string;
        subject: string;
        hasAttachment: string;
        after: string;
        before: string;
      };
      clearFilter: string;
    };
    noProviders: string;
    selectEmail: string;
    allAccountsLabel: string;
    accounts: string;
    starredFolderLabel: string;
    sentStatus: string;
    quickFilters: {
      title: string;
      unread: string;
      today: string;
      thisWeek: string;
      hasAttachments: string;
      important: string;
      vip: string;
    };
    headerStats: {
      unreadCount: string;
      totalEmails: string;
    };
    bulkBar: {
      selected: string;
      selectedLabel: string;
      clearSelection: string;
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
      dropFilesHere: string;
      addRecipients: string;
      releaseToAttachFiles: string;
      removeAttachment: string;
      attachments: string;
      formatting: string;
      undo: string;
      redo: string;
      fontFamily: string;
      fontSize: string;
      fontSizeDefault: string;
      headingSelect: string;
      headingParagraph: string;
      heading1: string;
      heading2: string;
      heading3: string;
      heading4: string;
      heading5: string;
      heading6: string;
      textAlign: string;
      alignLeft: string;
      alignCenter: string;
      alignRight: string;
      alignJustify: string;
      bold: string;
      italic: string;
      underline: string;
      strikethrough: string;
      subscript: string;
      superscript: string;
      bulletList: string;
      numberedList: string;
      taskList: string;
      indent: string;
      unindent: string;
      quote: string;
      code: string;
      codeBlock: string;
      horizontalRule: string;
      addTable: string;
      removeFormatting: string;
      textColor: string;
      highlight: string;
      insertLink: string;
      removeLink: string;
      insertImage: string;
      colorPickerCancel: string;
      colorPickerSave: string;
      colorPickerReset: string;
      colorPickerRemove: string;
      colorPickerPlaceholder: string;
      imageUrlPrompt: string;
      insert: string;
      link: string;
      // Table toolbar labels (TableBubbleMenu)
      tableInsertColumnBefore: string;
      tableInsertColumnAfter: string;
      tableDeleteColumn: string;
      tableInsertRowBefore: string;
      tableInsertRowAfter: string;
      tableDeleteRow: string;
      tableMergeCells: string;
      tableSplitCell: string;
      tableToggleHeaderRow: string;
      tableToggleHeaderColumn: string;
      tableToggleHeaderCell: string;
      tableDeleteTable: string;
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
      missingOriginalReply: string;
      missingOriginalForward: string;
      defaultBadge: string;
      addEmailPrefix: string;
      // Font family labels
      fontSansSerif: string;
      fontSerif: string;
      fontMonospace: string;
      fontCursive: string;
      // Color labels
      colorBlack: string;
      colorWhite: string;
      colorGrey: string;
      colorRed: string;
      colorOrange: string;
      colorYellow: string;
      colorGreen: string;
      colorBlue: string;
      colorDarkGrey: string;
      colorLightGrey: string;
      colorLightRed: string;
      colorLightOrange: string;
      colorLightGreen: string;
      colorLightBlue: string;
      colorLightPurple: string;
      uploadError: string;
      fileTooLarge: string;
      fileTypeNotAllowed: string;
      totalSizeExceeded: string;
      draftSaved: string;
      draftSaveFailed: string;
      draftDeleted: string;
      draftDeleteFailed: string;
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
      aiComposeGenerating: string;
      aiComposeReject: string;
      aiComposeAccept: string;
      aiMenu: {
        titleRefine: string;
        titleDraft: string;
        placeholderRefine: string;
        placeholderDraft: string;
        fixSpelling: string;
        makeShorter: string;
        makeLonger: string;
        makeProfessional: string;
        makeFriendly: string;
        draftProjectUpdate: string;
        draftProjectUpdateSecondary: string;
        draftFollowUp: string;
        draftFollowUpSecondary: string;
        draftMeetingRequest: string;
        // Tone options for new drafts
        toneSection: string;
        toneProfessional: string;
        toneFriendly: string;
        toneCasual: string;
        // Personalization
        personalizationSection: string;
        useWritingStyle: string;
        writingStyleActive: string;
        writingStyleLearn: string;
        // AI instruction prompts
        fixSpellingInstruction: string;
        shortenInstruction: string;
        expandInstruction: string;
        professionalInstruction: string;
        friendlyInstruction: string;
        modifySelectedText: string;
        returnModifiedText: string;
        writeEmailIn: string;
      };
      aiModifyTitle: string;
      aiModifyPlaceholder: string;
      aiModifySelectedText: string;
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
      fullscreen: string;
      exitFullscreen: string;
      selectSignature: string;
      noSignature: string;
      changeSignature: string;
      loadTemplate: string;
      templateApplied: string;
      replaceContent: string;
    };
    aiDraft: {
      badge: string;
      generating: string;
      regenerate: string;
      regenerateWith: string;
      restore: string;
      cleared: string;
      failed: string;
      toneLabel: string;
      toneFormal: string;
      toneCasual: string;
      toneShorter: string;
      toneDetailed: string;
      instructionPlaceholder: string;
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
      importantOnly: string;
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
      aiExampleInvoicePayments: string;
      aiExamplePresentation: string;
      aiExampleDeadlines: string;
      aiExampleContracts: string;
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
      // LabelDialog & ColorPicker
      presetColors: string;
      customColor: string;
      nameLabel: string;
      namePlaceholder: string;
      preview: string;
      deleteLabel: string;
      deleteConfirmation: string;
      deleteWarning: string;
      create: string;
      // LabelPickerDialog
      addLabels: string;
      addToEmail: string;
      addToEmails: string;
      searchLabels: string;
      noLabelsFound: string;
      addSelected: string;
      labelSelected: string;
      labelsSelected: string;
      // Nested label tree
      parentLabel: string;
      noParent: string;
      addChildLabel: string;
      changeColor: string;
      moveTo: string;
      deleteSubtreeWarning: string;
      searchLabelsPlaceholder: string;
      depthLimitReached: string;
      collapseAll: string;
      expandAll: string;
      aiPromptLabel: string;
      aiPromptPlaceholder: string;
      aiPromptHelperText: string;
      errors: {
        nameRequired: string;
        nameTooShort: string;
        nameExists: string;
        saveFailed: string;
        selectLabel: string;
        addFailed: string;
      };
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
      vipTitle: string;
      vipSubtitle: string;
    };
    view: {
      folderLabel: string;
      attachments: string;
      attachmentsWithCount: string;
      attachmentsTooltip: string;
      fileSizeBytes: string;
      fileSizeKB: string;
      fileSizeMB: string;
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
      failedToDownload: string;
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
      downloadImage: string;
      toPrefix: string;
      toMe: string;
    };
    actions: {
      syncNow: string;
      runRetention: string;
      compose: string;
      star: string;
      unstar: string;
      markRead: string;
      markUnread: string;
      archive: string;
    };
    // AI Compose Dialog
    aiCompose: {
      title: string;
      promptRequired: string;
      generateError: string;
      quickPrompts: string;
      prompts: {
        followUp: string;
        thankYou: string;
        introduction: string;
        requestMeeting: string;
        apology: string;
        reminder: string;
      };
      promptLabel: string;
      promptPlaceholder: string;
      toneLabel: string;
      tones: {
        professional: string;
        friendly: string;
        formal: string;
        casual: string;
        persuasive: string;
        empathetic: string;
      };
      generating: string;
      generate: string;
      preview: string;
      subject: string;
      insertIntoEmail: string;
      accept: string;
      reject: string;
      regenerate: string;
    };
    // Email Templates Dialog
    templates: {
      title: string;
      saveError: string;
      nameRequired: string;
      contentRequired: string;
      savedSuccessfully: string;
      loadTab: string;
      saveTab: string;
      noTemplates: string;
      builtIn: string;
      noSubject: string;
      templateName: string;
      templateNamePlaceholder: string;
      preview: string;
      subject: string;
      composeFirst: string;
      saveTemplate: string;
      // CRUD operations (Phase 9)
      create: string;
      edit: string;
      delete: string;
      duplicate: string;
      useTemplate: string;
      noTemplatesHint: string;
      name: string;
      namePlaceholder: string;
      subjectPlaceholder: string;
      body: string;
      bodyPlaceholder: string;
      category: string;
      categoryPlaceholder: string;
      isDefault: string;
      setDefault: string;
      created: string;
      updated: string;
      deleted: string;
      duplicated: string;
      confirmDelete: string;
      selectTemplate: string;
      insertTemplate: string;
      replaceContent: string;
      manage: string;
      categories: {
        [key: string]: string;
      };
      builtInTemplates: {
        [key: string]: { name: string; subject: string; body: string };
      };
    };
    // Schedule Send Dialog
    scheduleSend: {
      title: string;
      customTime: string;
      schedule: string;
      clearSchedule: string;
      scheduledFor: string;
      options: {
        [key: string]: string;
      };
    };
    // Scheduled Emails Management
    scheduledEmails: {
      title: string;
      noScheduled: string;
      cancel: string;
      cancelConfirm: string;
      cancelSuccess: string;
      reschedule: string;
      rescheduleSuccess: string;
      status: {
        pending: string;
        processing: string;
        sent: string;
        failed: string;
      };
      scheduledFor: string;
      recipients: string;
    };
    // Follow-up Indicator
    followUpIndicator: {
      pending: string;
      overdue: string;
      dueDate: string;
      resolve: string;
      snooze: string;
      noFollowUp: string;
    };
    // Undo Send Feature (Phase 9)
    undoSend: {
      sending: string;
      sent: string;
      undo: string;
      undoing: string;
      cancelled: string;
      secondsRemaining: string;
      sendingIn: string;
    };
    // Keyboard Shortcuts Help (Phase 05-02)
    keyboardShortcuts: {
      title: string;
      navigation: string;
      moveDown: string;
      moveUp: string;
      open: string;
      close: string;
      actions: string;
      archive: string;
      delete: string;
      reply: string;
      replyAll: string;
      forward: string;
      toggleSelect: string;
      other: string;
      compose: string;
      search: string;
      showHelp: string;
      commandPalette: string;
    };
  };
  calendar: {
    title: string;
    description: string;
    emptyTitle?: string;
    emptyDescription?: string;
    emptyCta?: string;
    refreshTooltip: string;
    previousPeriod: string;
    nextPeriod: string;
    openSidebar: string;
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
    openAiAssistantPrompt: string;
    noEventsMessage: string;
    failedToCreateEvent: string;
    failedToLoadEvents: string;
    eventCreated: string;
    failedToCreateQuickEvent: string;
    colorUpdated: string;
    failedToUpdateColor: string;
    eventUpdated: string;
    failedToUpdateEvent: string;
    eventMoved: string;
    failedToMoveEvent: string;
    eventResized: string;
    failedToResizeEvent: string;
    eventDeleted: string;
    failedToDeleteEvent: string;
    failedToLoadEventDetails: string;
    createCalendarAction: string;
    createCalendarDialogTitle: string;
    deleteCalendarAction: string;
    deleteCalendarConfirm: string;
    calendarNameLabel: string;
    calendarNameRequired: string;
    calendarDescriptionLabel: string;
    calendarColorLabel: string;
    providerLabel: string;
    providerRequired: string;
    calendarCreated: string;
    failedToCreateCalendar: string;
    calendarDeleted: string;
    failedToDeleteCalendar: string;
    validation: {
      titleRequired: string;
      startRequired: string;
      endRequired: string;
      endAfterStart: string;
      duplicateEvent: string;
    };
    rsvp: {
      accept: string;
      decline: string;
      maybe: string;
      accepted: string;
      declined: string;
      tentative: string;
      respondToInvite: string;
      changeResponse: string;
    };
    attendeesPicker: {
      label: string;
      placeholder: string;
      organizer: string;
      you: string;
      invalidEmail: string;
      duplicateAttendee: string;
      maxAttendeesReached: string;
      accepted: string;
      declined: string;
      tentative: string;
      needsAction: string;
    };
    reminders: {
      label: string;
      addReminder: string;
      noReminders: string;
      atTime: string;
      fiveMinutes: string;
      tenMinutes: string;
      fifteenMinutes: string;
      thirtyMinutes: string;
      oneHour: string;
      twoHours: string;
      oneDay: string;
      twoDays: string;
      oneWeek: string;
      methodPopup: string;
      methodEmail: string;
      minutesUnit: string;
      hourUnit: string;
      hoursUnit: string;
      dayUnit: string;
      daysUnit: string;
    };
    recurrence: {
      label: string;
      none: string;
      daily: string;
      dailyDescription: string;
      weekly: string;
      weeklyOn: string;
      weeklyDescription: string;
      monthly: string;
      monthlyOn: string;
      monthlyDescription: string;
      yearly: string;
      yearlyDescription: string;
      weekdays: string;
      weekdaysDescription: string;
      custom: string;
      customDescription: string;
      ordinals: {
        first: string;
        second: string;
        third: string;
        fourth: string;
        fifth: string;
      };
    };
    colorPicker: {
      title: string;
      presetColors: string;
      customColor: string;
      hexInput: string;
      apply: string;
    };
    changeColor: string;
    attachments: string;
    download: string;
    close: string;
    allDay: string;
    noCalendarsFound: string;
    failedToDownloadAttachment: string;
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
    priority: {
      high: string;
      medium: string;
      low: string;
    };
    emptyTitle: string;
    emptyDescription: string;
    emptyCta?: string;
    comingSoon: string;
    errorLoading: string;
    waitingFor: string;
    todo: string;
    overdue: string;
    dueToday: string;
    noFilterResults: string;
    commitmentPrefix: string;
    waitingOnPrefix: string;
    statsPending: string;
    statsOverdue: string;
    untitled?: string;
  };
  contacts: {
    title: string;
    description: string;
    emptyCta?: string;
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
      markVip: string;
      removeVip: string;
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
      // Tabs
      tabs: {
        details: string;
        activity: string;
        notes: string;
      };
      // Interactions
      interactions: {
        label: string;
        emailSent: string;
        emailReceived: string;
        meeting: string;
        call: string;
        note: string;
        to: string;
        from: string;
        contact: string;
      };
      // Activity section
      activity: {
        title: string;
        loadError: string;
        noActivity: string;
      };
      // Notes section
      notes: {
        title: string;
        noNotes: string;
        addNote: string;
      };
      // Additional fields
      relationshipIntelligence: string;
      totalInteractions: string;
      vip: string;
      vipLabel: string;
      vipHelper: string;
      relationshipScore: string;
      addEmailHint: string;
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
      deletedCount: string;
      bulkDeleteConfirm?: string;
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
      firstName: string;
      lastName: string;
      birthday: string;
      website: string;
      department: string;
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
    // Edit dialog
    editDialogTitle: string;
    editTooltip: string;
    deleteDialogDescription: string;
    saveChanges: string;
    editForm: {
      displayNameLabel: string;
      displayNamePlaceholder: string;
      displayNameHelper: string;
      scopeLabel: string;
      scopePlaceholder: string;
      scopeHelper: string;
    };
    errors: {
      deleteFailed: string;
      updateFailed: string;
    };
    limits: {
      title: string;
      current: string;
      unlimited: string;
      reachedTitle: string;
      reachedMessage: string;
      upgradePrompt: string;
      upgradeButton: string;
    };
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
    emailReadonlyHint?: string;
    saving: string;
    saveChanges: string;
    successMessage: string;
    errorMessage: string;
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
      signatures: string;
      templates: string;
      scheduled: string;
      consent: string;
      dataRights: string;
      account: string;
      notifications: string;
      billing: string;
    };
    consentPanel?: {
      title: string;
      description: string;
      categories: {
        ai: string;
        data: string;
      };
      features: {
        ai_email_processing: { label: string; description: string };
        ai_chat: { label: string; description: string };
        ai_smart_replies: { label: string; description: string };
        ai_summarization: { label: string; description: string };
        ai_scheduling: { label: string; description: string };
        ai_auto_triage: { label: string; description: string };
        email_analytics: { label: string; description: string };
        contact_enrichment: { label: string; description: string };
      };
      consentUpdated: string;
      consentError: string;
      lastUpdated: string;
      version: string;
    };
    writingStylePanel?: {
      title: string;
      subtitle: string;
      greeting: string;
      tone: string;
      signOff: string;
      formality: string;
      formalityFormal: string;
      formalitySemiFormal: string;
      formalityCasual: string;
      avgSentenceLength: string;
      words: string;
      sampleCount: string;
      lastAnalyzed: string;
      manualSamples: string;
      manualSamplesHelp: string;
      manualSamplesSave: string;
      manualSamplesSaved: string;
      selectAccount: string;
      defaultProfile: string;
      noProfile: string;
      draftStats: string;
      totalDrafts: string;
      acceptRate: string;
      editRate: string;
      rejectRate: string;
      avgEditDistance: string;
      noDraftStats: string;
    };
    signaturesPanel?: {
      title: string;
      description: string;
      addSignature: string;
      editSignature: string;
      deleteSignature: string;
      signatureName: string;
      signatureNamePlaceholder: string;
      signatureContent: string;
      setAsDefault: string;
      defaultBadge: string;
      save: string;
      cancel: string;
      deleteConfirmTitle: string;
      deleteConfirmMessage: string;
      noSignatures: string;
      previewTitle: string;
      provider: string;
      allProviders: string;
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
      emailDensityLabel?: string;
      emailDensityDescription?: string;
      emailDensities?: {
        comfortable: string;
        compact: string;
        spacious: string;
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
      emailNotificationsTitle: string;
      notificationOptions: {
        newEmails: string;
        newEmailsDescription: string;
        calendarReminders: string;
        calendarRemindersDescription: string;
        aiActions: string;
        aiActionsDescription: string;
        taskDeadlines: string;
        taskDeadlinesDescription: string;
      };
      reset: string;
      save: string;
      saving: string;
      saveSuccess: string;
      saveError: string;
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
      clearMemoryConfirm: string;
      resetLearning: string;
      autoApproveLabel: string;
      autoApproveHint: string;
      featuresTitle: string;
      featuresDescription: string;
      smartRepliesTitle: string;
      summarizationTitle: string;
      schedulingTitle: string;
      triageTitle: string;
      personalizationTitle: string;
      personalizationDescription: string;
      roleLabel: string;
      communicationLabel: string;
      responseLengthLabel: string;
      proactivityLabel: string;
      smartReplies: string;
      smartRepliesDescription: string;
      smartRepliesRequiresStarter: string;
      summarization: string;
      summarizationDescription: string;
      summarizationRequiresStarter: string;
      scheduling: string;
      schedulingDescription: string;
      triage: string;
      triageDescription: string;
      triageRequiresPro: string;
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
          CREATIVE: string;
        };
        responseLength: string;
        responseLengthDescription: string;
        lengths: {
          BRIEF: string;
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
      // Working Hours
      workingHoursLabel: string;
      workingHoursDescription: string;
      startTimeLabel: string;
      endTimeLabel: string;
      workingDaysLabel: string;
      days: {
        MON: string;
        TUE: string;
        WED: string;
        THU: string;
        FRI: string;
        SAT: string;
        SUN: string;
      };
      actions: {
        title: string;
        description: string;
        clearMemory: string;
        clearMemoryConfirm: string;
        resetLearning: string;
        resetLearningConfirm: string;
      };
      // Job Details
      jobDetailsTitle: string;
      jobDetailsDescription: string;
      jobTitleLabel: string;
      jobTitlePlaceholder: string;
      departmentLabel: string;
      departmentPlaceholder: string;
      industryLabel: string;
      industryPlaceholder: string;
      companySizeLabel: string;
      companySizes: {
        SOLO: string;
        STARTUP: string;
        SMB: string;
        ENTERPRISE: string;
      };
      // Notification Frequency
      notificationFrequencyLabel: string;
      notificationFrequencyDescription: string;
      notificationFrequencies: {
        IMMEDIATE: string;
        DIGEST: string;
        MINIMAL: string;
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
      avatar: {
        title: string;
        upload: string;
        change: string;
        remove: string;
        dropHint: string;
        sizeHint: string;
        uploading: string;
        uploadSuccess: string;
        uploadError: string;
        removeConfirm: string;
        editor: {
          title: string;
          uploadTab: string;
          chooseTab: string;
          zoom: string;
          rotate: string;
          randomize: string;
          styleLabel: string;
          cancel: string;
          save: string;
          saving: string;
        };
      };
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
    securityPanel?: {
      title: string;
      description: string;
      mfa: {
        title: string;
        description: string;
        totp: {
          title: string;
          description: string;
          enabled: string;
          disabled: string;
          enable: string;
          disable: string;
          scanQr: string;
          enterCode: string;
          verifyCode: string;
          passwordRequired: string;
        };
        passkeys: {
          title: string;
          description: string;
          add: string;
          noPasskeys: string;
          maxReached: string;
          remove: string;
          rename: string;
          registered: string;
          adding: string;
          removeConfirm: string;
        };
        backupCodes: {
          title: string;
          description: string;
          regenerate: string;
          download: string;
          warning: string;
          remaining: string;
          regenerateConfirm: string;
        };
      };
      sessions: {
        title: string;
        description: string;
        current: string;
        revokeAll: string;
        revoke: string;
        lastActive: string;
        noOtherSessions: string;
      };
      connectedAccounts: {
        title: string;
        description: string;
        link: string;
        unlink: string;
        google: string;
        microsoft: string;
        linked: string;
        notLinked: string;
        unlinkConfirm: string;
        cannotUnlinkLast: string;
      };
      password: {
        title: string;
        description: string;
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
        change: string;
        set: string;
        setDescription: string;
        success: string;
        mismatch: string;
        tooShort: string;
      };
    };
    dataRights?: {
      title: string;
      export: {
        title: string;
        description: string;
        requestButton: string;
        downloadButton: string;
        status: {
          PENDING: string;
          PROCESSING: string;
          READY: string;
          EXPIRED: string;
          FAILED: string;
        };
        expiresAt: string;
        fileSize: string;
        noExports: string;
        requestSuccess: string;
        includes: string;
      };
      deletion: {
        title: string;
        description: string;
        warning: string;
        requestButton: string;
        cancelButton: string;
        confirmTitle: string;
        confirmMessage: string;
        confirmButton: string;
        status: {
          ACTIVE: string;
          SCHEDULED: string;
        };
        purgeDate: string;
        daysRemaining: string;
        cancelSuccess: string;
        requestSuccess: string;
      };
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
      pendingFollowUps: string;
      writeEmail: string;
      analyzeContacts: string;
      aiSuggestions: string;
    };
    emailActions?: {
      reply: string;
      summarize: string;
      archive: string;
      addLabel: string;
      sectionTitle: string;
    };
    dashboard: {
      greeting: string;
      greetingQuestion: string;
    };
    actions: {
      sendEmail: string;
      createEvent: string;
      updateContact: string;
      requiresApproval: string;
      stop: string;
    };
    errors: {
      chatFailed: string;
      connectionLost: string;
      rateLimit: string;
      circuitOpen: string;
      timeout: string;
      retryHint: string;
    };
    suggestedQuestions: {
      title: string;
      tooltip: string;
    };
    askUser: {
      title: string;
      other: string;
      otherPlaceholder: string;
      placeholder: string;
      submit: string;
      cancel: string;
      continue: string;
    };
    memory: {
      title: string;
      subtitle: string;
      noMemories: string;
      noMemoriesHint: string;
      add: string;
      placeholder: string;
      moreMemories: string;
      memoryCount: string;
      memoryCountPlural: string;
    };
    widgets: {
      title: string;
      subtitle: string;
    };
    emailChat?: {
      panelTitle: string;
      contextLabel: string;
      inputPlaceholder: string;
      close: string;
      noMessages: string;
      draftReply: string;
      keyPoints: string;
    };
    tools?: {
      argsLabel?: string;
      resultLabel?: string;
      [key: string]: { calling?: string; complete?: string } | string | undefined;
    };
    toolUi?: {
      analyzingEmail?: string;
      analysisFailed?: string;
      deadline?: string;
      priority?: string;
      generatingBriefing?: string;
      dailyBriefing?: string;
      deadlinesCount?: string;
      actionItemsCount?: string;
      searchingContacts?: string;
      noContactsFound?: string;
      total?: string;
      unread?: string;
      read?: string;
      loadingRelationship?: string;
      relationshipStats?: string;
      reEngagementHint?: string;
      cc?: string;
      loadingEmailContent?: string;
      loadingEmailIndex?: string;
      noEmailsInIndex?: string;
      from?: string;
      subject?: string;
      date?: string;
      searchFailed?: string;
      noEmailsFound?: string;
      emailSearch?: string;
      semanticSearch?: string;
      loadingEvents?: string;
      noEventsFound?: string;
      loadingFolders?: string;
      noFoldersFound?: string;
      searchingMemories?: string;
      creatingReminder?: string;
      reminderFailed?: string;
      loadingReminders?: string;
      noRemindersFound?: string;
      processingBulkAction?: string;
      noSubject?: string;
      to?: string;
      failedToLoad?: string;
      noEmailContent?: string;
      showMore?: string;
      showLess?: string;
      retry?: string;
      positive?: string;
      negative?: string;
      neutral?: string;
      draftSaved?: string;
      openInEditor?: string;
      creatingDraft?: string;
      draftFailed?: string;
      fromLabel?: string;
      loadingFollowUps?: string;
      failedToLoadFollowUps?: string;
      followUpsTitle?: string;
      noFollowUpsFound?: string;
    };
    commandPalette?: {
      title?: string;
      placeholder?: string;
      noResults?: string;
      hint?: string;
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
    approve: string;
    reject: string;
    needsReview: string;
    pending: string;
    viewAllActions: string;
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
      progress: {
        understanding: string;
        analyzing: string;
        searching: string;
        generating: string;
        finalizing: string;
        working: string;
      };
      agents: {
        intent: string;
        email: string;
        calendar: string;
        contacts: string;
        response: string;
        supervisor: string;
        emailDraft: string;
        emailSearch: string;
        calendarSchedule: string;
        knowledge: string;
        general: string;
        websearch: string;
        analytics: string;
        unifiedKnowledge: string;
        documentLibrary: string;
        unknown: string;
      };
      actions: {
        intent: { started: string; processing: string; completed: string };
        supervisor: { started: string; processing: string; completed: string };
        email: { started: string; processing: string; completed: string };
        calendar: { started: string; processing: string; completed: string };
        contacts: { started: string; processing: string; completed: string };
        response: { started: string; processing: string; completed: string };
        knowledge: { started: string; processing: string; completed: string };
        general: { started: string; processing: string; completed: string };
      };
    };
    sessions: {
      title: string;
      newChat: string;
      noSessions: string;
      noSessionsHint: string;
      loadSession: string;
      deleteSession: string;
      renameSession: string;
      generating: string;
      untitled: string;
      today: string;
      yesterday: string;
      thisWeek: string;
      older: string;
      confirmDelete: string;
      deleted: string;
      collapse: string;
      expand: string;
      selectAll: string;
      deselectAll: string;
      deleteSelected: string;
      confirmBulkDelete: string;
      bulkDeleted: string;
      autoGeneratingTitle: string;
      selectedCount: string;
      conversationCount: string;
      conversationCountPlural: string;
      messageCount: string;
      messageCountPlural: string;
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
      overallProgress: string;
      interactions: string;
      // New learning widget strings
      noData?: string;
      early?: string;
      improving?: string;
      good?: string;
      excellent?: string;
      approved?: string;
      success?: string;
      actions?: string;
      approvalTooltip?: string;
      successTooltip?: string;
      interactionsTooltip?: string;
      noInteractions?: string;
      writingStyle?: string;
      emailsAnalyzed?: string;
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
      // LearningProgressCard specific (legacy)
      approvalRate?: string;
      successRate?: string;
      totalActions?: string;
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
    // Superhuman-style mentions
    mentions: {
      contacts: string;
      accounts: string;
      selectContact: string;
      selectAccount: string;
      noContactsFound: string;
      noAccountsFound: string;
      navigate: string;
      select: string;
      close: string;
      typeHint: string;
    };
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
    triage: {
      title: string;
      emailCount: string;
      applyAll: string;
      applySelected: string;
      dismiss: string;
      labelSuggestion: string;
      priorityLabel: string;
      sentimentLabel: string;
      noSuggestions: string;
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
    memoryBrowser: {
      title: string;
      subtitle: string;
      searchPlaceholder: string;
      addMemory: string;
      addMemoryPlaceholder: string;
      clearAll: string;
      clearAllConfirm: string;
      noMemories: string;
      noMemoriesDescription: string;
      noSearchResults: string;
      categories: {
        all: string;
        PREFERENCE: string;
        FACT: string;
        PATTERN: string;
        INTERACTION: string;
        CONTACT_NOTE: string;
      };
      categoryDescriptions: {
        PREFERENCE: string;
        FACT: string;
        PATTERN: string;
        INTERACTION: string;
        CONTACT_NOTE: string;
      };
      stats: {
        total: string;
        lastUpdated: string;
      };
      actions: {
        delete: string;
        deleteConfirm: string;
        copied: string;
        copy: string;
        showHistory: string;
      };
      loading: string;
      error: string;
      retry: string;
      memoryAdded: string;
      memoryDeleted: string;
      memoriesCleared: string;
      history: {
        title: string;
        noHistory: string;
        action: {
          CREATE: string;
          UPDATE: string;
          DELETE: string;
        };
        previousValue: string;
        newValue: string;
      };
      patterns: {
        title: string;
        subtitle: string;
        noPatterns: string;
        noPatternsDescription: string;
        taskTypes: {
          email_reply: string;
          schedule_meeting: string;
          follow_up: string;
          contact_update: string;
        };
        successRate: string;
        usedCount: string;
        lastUsed: string;
        steps: string;
      };
      tabs: {
        memories: string;
        patterns: string;
      };
    };
    followUpTracker: {
      title: string;
      subtitle: string;
      searchPlaceholder: string;
      noFollowUps: string;
      noFollowUpsDescription: string;
      noSearchResults: string;
      tabs: {
        all: string;
        pending: string;
        overdue: string;
        resolved: string;
      };
      types: {
        all: string;
        waitingFor: string;
        todo: string;
      };
      typeDescriptions: {
        waitingFor: string;
        todo: string;
      };
      status: {
        PENDING: string;
        REMINDED: string;
        RESOLVED: string;
        EXPIRED: string;
      };
      stats: {
        total: string;
        pending: string;
        overdue: string;
        dueToday: string;
        resolved: string;
      };
      actions: {
        resolve: string;
        snooze: string;
        view: string;
        delete: string;
      };
      snooze: {
        title: string;
        oneHour: string;
        fourHours: string;
        tomorrow: string;
        nextWeek: string;
        custom: string;
        inThreeDays?: string;
        nextMonth?: string;
        pickDate?: string;
      };
      dueDate: string;
      reason: string;
      noReason: string;
      reminderCount: string;
      overdueWarning: string;
      dueTodayWarning: string;
      loading: string;
      error: string;
      retry: string;
      resolved: string;
      snoozed: string;
      extraction: {
        waitingFor: string;
        commitments: string;
        actionItems: string;
        confidence: string;
        emailType: string;
      };
      emailTypes?: {
        receipt: string;
        notification: string;
        request: string;
        conversation: string;
        newsletter: string;
        alert: string;
      };
      smartTiming: {
        title: string;
        recommended: string;
        basedOnPatterns: string;
        optimalWindow: string;
        tuesThurs: string;
      };
      deadline: {
        detected: string;
        source: {
          nlp: string;
          manual: string;
          extraction: string;
        };
      };
      kanban?: {
        subtitle: string;
        columns: {
          pending: string;
          overdue: string;
          resolved: string;
          expired: string;
        };
        empty: {
          dropHere: string;
          noItems: string;
          noPending: string;
          noPendingHint?: string;
          noOverdue: string;
          noOverdueHint?: string;
          noResolved: string;
          noResolvedHint?: string;
          noExpired: string;
          noExpiredHint?: string;
        };
        deleteConfirm?: string;
        keyboard: {
          title: string;
          navigation: string;
          actions: string;
          moveDown: string;
          moveUp: string;
          prevColumn: string;
          nextColumn: string;
          openEmail: string;
          resolve: string;
          snooze: string;
          showHelp: string;
          clearSelection: string;
        };
      };
    };
    // Reminders (Follow-Up AI)
    reminders: {
      title: string;
      subtitle: string;
      searchPlaceholder: string;
      noReminders: string;
      noRemindersDescription: string;
      emptyTitle?: string;
      emptyDescription?: string;
      emptyCta?: string;
      newReminder: string;
      createDialog: {
        title: string;
        placeholder: string;
        hint: string;
        create: string;
        cancel: string;
      };
      status: {
        attivo: string;
        completato: string;
        annullato: string;
        sospeso: string;
      };
      priorita: {
        alta: string;
        media: string;
        bassa: string;
      };
      periodo: {
        mattina: string;
        pomeriggio: string;
        sera: string;
        tutto_il_giorno: string;
      };
      azione: {
        chiama: string;
        scrivi_mail: string;
        verifica: string;
        conferma: string;
        controlla: string;
        altro: string;
      };
      condizione: {
        sempre: string;
        se_risponde_mail: string;
        se_non_risponde_mail: string;
        manuale: string;
      };
      actions: {
        complete: string;
        delete: string;
        edit: string;
      };
      deleteConfirm?: string;
      bulkDeleteConfirm?: string;
      selected?: string;
      selectAll?: string;
      deselectAll?: string;
      deleteSelected?: string;
      fields: {
        contact: string;
        deadline: string;
        condition: string;
        telegramMessage: string;
        emailMonitoring: string;
      };
      telegram: {
        title: string;
        chatId: string;
        chatIdHelper: string;
        active: string;
        slotMattina: string;
        slotPomeriggio: string;
        slotSera: string;
        save: string;
        disconnect: string;
        disconnectConfirm: string;
        notConfigured: string;
        sent: string;
        connect: string;
        qrHint: string;
        regenerateQr: string;
        linkExpired: string;
        linkError: string;
        connected: string;
        saved: string;
      };
      loading: string;
      error: string;
      retry: string;
    };
    // HITL Inline Action Card
    inlineAction: {
      actionTypes: {
        SEND_EMAIL: string;
        CREATE_EVENT: string;
        UPDATE_CONTACT: string;
        DELETE_EMAIL: string;
        MOVE_EMAIL: string;
        REPLY_EMAIL: string;
        FORWARD_EMAIL: string;
        SCHEDULE_MEETING: string;
        CREATE_TASK: string;
        ADD_LABEL: string;
        ARCHIVE_EMAIL: string;
        SNOOZE_EMAIL: string;
        CREATE_CONTACT: string;
        DELETE_CONTACT: string;
      };
      severity: {
        LOW: string;
        MEDIUM: string;
        HIGH: string;
      };
      fields: {
        to: string;
        cc: string;
        bcc: string;
        subject: string;
        body: string;
        title: string;
        location: string;
        attendees: string;
        startTime: string;
        endTime: string;
        notes: string;
      };
      reasoning: string;
      actionDetails: string;
      editPayload: string;
      hideDetails: string;
      approved: string;
      rejected: string;
      executed: string;
      failed: string;
      expired: string;
      approving: string;
      rejecting: string;
      executionSuccess: string;
      executionFailed: string;
    };
  };
  commandPalette: {
    searchPlaceholder: string;
    navigation: string;
    actions: string;
    ai: string;
    productivity: string;
    system: string;
    recentSearches: string;
    emailResults: string;
    noResults: string;
    pressEnterToSearch: string;
    navigate: string;
    select: string;
    close: string;
    openWith: string;
    commands: {
      goToDashboard: string;
      goToInbox: string;
      goToCalendar: string;
      goToContacts: string;
      goToAiAssistant: string;
      goToAnalytics: string;
      goToSettings: string;
      composeEmail: string;
      searchEmails: string;
      archiveSelected: string;
      toggleStar: string;
      deleteSelected: string;
      aiSummarize: string;
      aiQuickReply: string;
      aiComposeContext: string;
      viewFollowups: string;
      viewDeadlines: string;
      viewStaleContacts: string;
      searchAiMemories: string;
      searchDocuments: string;
      logout: string;
    };
  };
  analytics?: {
    emptyTitle?: string;
    emptyDescription?: string;
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
    notFoundMessage: string;
    serverErrorMessage: string;
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
    emailAlreadyRegistered: string;
    registrationFailed: string;
    invalidCredentials: string;
    setupFailed: string;
    verifyFailed: string;
    disableFailed: string;
    notEnabled: string;
    alreadyEnabled: string;
    // ErrorBoundary messages
    somethingWentWrong: string;
    errorOccurred: string;
    unexpectedError: string;
    tryAgainOrReturn: string;
    failedToLoad: string;
    // Email errors
    missingProviderInfo: string;
    moveFailed: string;
    // Email mutation errors (used by TanStack Query onError callbacks)
    sendEmailFailed: string;
    replyFailed: string;
    forwardFailed: string;
    updateEmailFailed: string;
    deleteEmailFailed: string;
    deleteEmailsFailed: string;
    updateReadStatusFailed: string;
    markEmailsFailed: string;
    moveEmailsFailed: string;
    addLabelsFailed: string;
    removeLabelsFailed: string;
    saveDraftFailed: string;
    deleteDraftFailed: string;
    calendarInviteFailed: string;
    fetchErrorTitle?: string;
    fetchErrorDescription?: string;
    connectionErrorTitle?: string;
    connectionErrorDescription?: string;
    accessDeniedTitle?: string;
    accessDeniedDescription?: string;
  };
  buttons: {
    tryAgain: string;
    goToDashboard: string;
    reload: string;
    goHome: string;
    confirm: string;
    cancel: string;
  };
  folders: {
    title: string;
    // RFC 6154 standard folders
    all: string;
    inbox: string;
    sent: string;
    drafts: string;
    trash: string;
    spam: string;
    junk: string;
    archive: string;
    starred: string;
    flagged: string;
    important: string;
    // Microsoft Graph wellKnownName folders
    outbox: string;
    conversationhistory: string;
    clutter: string;
    scheduled: string;
    conflicts: string;
    syncissues: string;
    // Gmail categories
    categoryPersonal: string;
    categorySocial: string;
    categoryPromotions: string;
    categoryUpdates: string;
    categoryForums: string;
    // Gmail labels
    unread: string;
    updates: string;
    // Folder management
    createFolder: string;
    renameFolder: string;
    deleteFolder: string;
    folderName: string;
    enterNewName: string;
    nameRequired: string;
    deleteWarning: string;
    deleteConfirm: string;
    deleteConfirmation: string;
    createSubfolder: string;
    moveEmailsHere: string;
    refresh: string;
    systemFolder: string;
    duplicateError: string;
    genericError: string;
    // Folder sync
    syncFolder: string;
    syncAllFolders: string;
    syncing: string;
    syncSuccess: string;
    syncSuccessProvider: string;
    syncSuccessComplete: string;
    syncFailed: string;
    syncFailedProvider: string;
    lastSynced: string;
    lastSyncedAgo: string;
    neverSynced: string;
    syncInProgress: string;
    refreshSuccess: string;
    refreshFailed: string;
    // FolderDialog
    selectAccount: string;
    nameLabel: string;
    namePlaceholder: string;
    willBeCreatedAs: string;
    create: string;
    noActionsAvailable: string;
    errors: {
      nameRequired: string;
      nameTooShort: string;
      providerRequired: string;
      saveFailed: string;
    };
  };
  // Email List
  emailList: {
    // Header
    selectAll: string;
    deselectAll: string;
    selected: string;
    refresh: string;
    markAsRead: string;
    markAsUnread: string;
    archive: string;
    delete: string;
    deleteSingleConfirm: string;
    moveToFolder: string;
    addLabel: string;
    applyAiSuggestions: string;
    aiTriageLabels: string;
    // Empty states
    emptyInbox: string;
    emptyInboxDesc: string;
    emptyFolder: string;
    emptyFolderDesc: string;
    emptySearch: string;
    emptySearchDesc: string;
    emptySearchAction: string;
    emptyInboxAction: string;
    emptyFolderAction: string;
    // List item
    flagged: string;
    unflagged: string;
    hasAttachments: string;
    threadCount: string;
    // AI indicators
    aiPriority: string;
    aiSentiment: {
      urgent: string;
      negative: string;
      positive: string;
      neutral: string;
    };
    // Loading
    loading: string;
    loadingMore: string;
    // Drag and drop
    dragToMove: string;
    dropToFolder: string;
    dragging: string;
    emailMoved: string;
    emailsMoved: string;
    archived: string;
    deleted: string;
    cannotMoveCrossProvider: string;
    dropHereToMove: string;
    // Keyboard navigation (Phase 9)
    keyboard: {
      nextEmail: string;
      prevEmail: string;
      openEmail: string;
      closeEmail: string;
      selectToggle: string;
      compose: string;
    };
  };
  // Thread Actions
  threadActions: {
    deleteThread: string;
    deleteThreadConfirm: string;
    deleteThreadDesc: string;
    moveThread: string;
    moveThreadTo: string;
    archiveThread: string;
    archiveThreadConfirm: string;
    archiveThreadDesc: string;
    markThreadRead: string;
    markThreadUnread: string;
    flagThread: string;
    unflagThread: string;
    addLabelsThread: string;
    threadDeleted: string;
    threadMoved: string;
    threadArchived: string;
    threadMarkedRead: string;
    threadMarkedUnread: string;
    threadFlagged: string;
    threadUnflagged: string;
    folderPickerComingSoon: string;
    labelPickerComingSoon: string;
    print: string;
  };
  // Thread View (reading pane) - New Outlook Style
  threadView?: {
    loading: string;
    emptyThread: string;
    threadNotFound?: string;
    connectionError?: string;
    messageCount: string;
    messageCountPlural: string;
    expandAll: string;
    collapseAll: string;
    actionsLabel: string;
    seeMoreMessages: string;
    hideMessages: string;
    sentAutoReply: string;
  };
  // Thread Message (individual email in thread)
  threadMessage?: {
    from: string;
    to: string;
    cc: string;
    bcc: string;
    attachments: string;
    reply: string;
    forward: string;
    replyAll: string;
    download: string;
    // AI Features (Phase 8)
    ai?: {
      summarize: string;
      summarizing: string;
      smartReply: string;
      generatingReplies: string;
      priority: string;
      sentiment: string;
      analyzing: string;
      copyToClipboard: string;
      copied: string;
      useReply: string;
      highPriority: string;
      mediumPriority: string;
      lowPriority: string;
      positive: string;
      negative: string;
      neutral: string;
      mixed: string;
      error: string;
      consentRequired: string;
    };
  };
  // Billing & Subscription (P10)
  billing?: {
    title: string;
    description: string;
    currentPlan: string;
    plans: {
      free: { name: string; description: string };
      starter: { name: string; description: string };
      professional: { name: string; description: string };
      enterprise: { name: string; description: string };
    };
    usage: {
      title: string;
      emails: string;
      aiCalls: string;
      used: string;
      remaining: string;
      unlimited: string;
      of: string;
      percentUsed: string;
      resetDate: string;
    };
    costProtection: {
      title: string;
      dailyCost: string;
      dailyCap: string;
      status: string;
      statusOk: string;
      statusWarning: string;
      statusCritical: string;
      statusBlocked: string;
      blocked: string;
      blockedDescription: string;
    };
    features: {
      title: string;
      basicEmail: string;
      smartReplies: string;
      summaries: string;
      autoTriage: string;
      briefings: string;
      rag: string;
      all: string;
      available: string;
      notAvailable: string;
    };
    actions: {
      upgrade: string;
      downgrade: string;
      cancel: string;
      cancelConfirm: string;
      cancelAtPeriodEnd: string;
      manageBilling: string;
      viewInvoices: string;
    };
    tabs: {
      overview: string;
      usage: string;
      plans: string;
      manage: string;
    };
    manage: {
      billingDescription: string;
      invoicesDescription: string;
    };
    alerts: {
      quotaWarning: string;
      quotaExceeded: string;
      costWarning: string;
      costBlocked: string;
      upgradeToUnlock: string;
    };
    pricing: {
      perMonth: string;
      perYear: string;
      custom: string;
      contactSales: string;
      currentPlan: string;
      mostPopular: string;
      includes: string;
    };
    checkout: {
      title: string;
      processing: string;
      success: string;
      failed: string;
      redirecting: string;
    };
    errors: {
      loadFailed: string;
      updateFailed: string;
      cancelFailed: string;
      quotaExceeded: string;
      featureNotAvailable: string;
    };
  };
  chat: {
    emptyState: {
      title: string;
      subtitle: string;
      capEmail?: string;
      capCalendar?: string;
      capContacts?: string;
      capEmailPrompt?: string;
      capCalendarPrompt?: string;
      capContactsPrompt?: string;
    };
    composer: {
      placeholder: string;
      send: string;
      stop: string;
    };
    actions: {
      copy: string;
      reload: string;
      edit: string;
    };
    reasoning: {
      label: string;
    };
    threadList: {
      title: string;
      newChat: string;
      deleteConfirm: string;
      deleteConfirmDescription?: string;
      noConversations?: string;
      selected?: string;
      bulkDelete?: string;
      bulkDeleteConfirm?: string;
      bulkDeleteConfirmDescription?: string;
    };
    hitl: {
      approveLabel: string;
      rejectLabel: string;
      pendingTitle: string;
      approvedChip: string;
      deniedChip: string;
      highChip: string;
      viewParameters: string;
      sensitivityLabel: string;
      sensitivityDescription: string;
      highOnly: string;
      allMutations: string;
      noneAutoExecute: string;
      noneWarning: string;
      noneDialogTitle: string;
      noneDialogBody: string;
      noneDialogConfirm: string;
      noneDialogCancel: string;
      updateError: string;
    };
    suggestions: {
      label: string;
    };
  };
  onboarding: {
    title: string;
    subtitle: string;
    steps: {
      legal: string;
      name: string;
      workspace: string;
      emailProvider: string;
      avatar: string;
      mfa: string;
    };
    next: string;
    back: string;
    finish: string;
    skip: string;
    stepContent?: {
      name: {
        title: string;
        description: string;
        firstName: string;
        lastName: string;
      };
      workspace: {
        title: string;
        description: string;
        workspaceName: string;
        placeholder: string;
        alreadySetUp: string;
      };
      emailProvider: {
        title: string;
        description: string;
        autoDetected: string;
        autoConnecting: string;
        connected: string;
        connectGmail: string;
        connectOutlook: string;
        skipForNow: string;
      };
      avatar: {
        title: string;
        description: string;
        upload: string;
        useOAuth: string;
        skip: string;
        fileTooLarge?: string;
      };
      legal: {
        title: string;
        description: string;
        acceptTos: string;
        acceptPp: string;
        readDocument: string;
        aiConsentTitle: string;
        aiConsentDescription: string;
        mustAcceptAll: string;
      };
      mfa: {
        title: string;
        description: string;
        chooseMethod: string;
        setupTotp: string;
        setupTotpDesc: string;
        setupPasskey: string;
        setupPasskeyDesc: string;
        bothRecommended: string;
        totpComplete: string;
        passkeyComplete: string;
        mustConfigureOne: string;
        enterPassword: string;
        enterCode: string;
        verifyCode: string;
        backupCodesTitle: string;
        backupCodesWarning: string;
        downloadCodes: string;
        addPasskey: string;
      };
    };
  };
  admin: {
    users: {
      title: string;
      searchPlaceholder: string;
      columns: {
        name: string;
        email: string;
        role: string;
        status: string;
        twoFactor: string;
        verified: string;
        created: string;
        actions: string;
      };
      banned: string;
      active: string;
      ban: string;
      unban: string;
      impersonate: string;
      sessions: string;
      noUsers: string;
      emptyTitle?: string;
      emptyDescription?: string;
      impersonateConfirm: string;
      impersonateWarning: string;
      unbanConfirm: string;
      accessRestricted: string;
      accessRestrictedUsers: string;
      accessRestrictedOrgs: string;
      banDialog: {
        title: string;
        reason: string;
        reasonPlaceholder: string;
        expiry: string;
        confirm: string;
        cancel: string;
      };
      sessionsDialog: {
        title: string;
        noSessions: string;
        revokeAll: string;
        revoke: string;
        device: string;
        ip: string;
        lastActive: string;
      };
    };
    impersonation: {
      banner: string;
      stop: string;
    };
  };
  organizations: {
    title: string;
    emptyTitle?: string;
    emptyDescription?: string;
    create: string;
    delete: string;
    deleteConfirm: string;
    name: string;
    slug: string;
    members: string;
    noOrganizations: string;
    createSuccess: string;
    deleteSuccess: string;
    inviteMember: string;
    inviteEmail: string;
    inviteSent: string;
    removeMember: string;
    removeConfirm: string;
    memberRemoved: string;
    emailHeader: string;
    joinedAt: string;
    status: string;
    pending: string;
    accepted: string;
    switchOrg: string;
    switchSuccess: string;
    invitationBanner: {
      title: string;
      accept: string;
      decline: string;
      accepted: string;
      declined: string;
    };
    invitationAccept: {
      title: string;
      accepting: string;
      success: string;
      error: string;
      expired: string;
      notFound: string;
      alreadyMember: string;
      missingId: string;
      goToDashboard: string;
      confirmMessage?: string;
      acceptButton?: string;
    };
  };
  pwa?: {
    install?: {
      chromiumMessage?: string;
      accept?: string;
      dismiss?: string;
      dismissAriaLabel?: string;
      iosMessage?: string;
      iosLearnHow?: string;
      iosTitle?: string;
      iosStep1?: string;
      iosStep2?: string;
      iosStep3?: string;
    };
    push?: {
      title?: string;
      description?: string;
      enableLabel?: string;
      blockedTitle?: string;
      blockedDescription?: string;
      subscribeError?: string;
      unsubscribeError?: string;
      prefsSaveError?: string;
      categoriesTitle?: string;
      categories?: {
        email?: string;
        emailDescription?: string;
        calendar?: string;
        calendarDescription?: string;
        ai?: string;
        aiDescription?: string;
      };
    };
    update?: {
      available?: string;
      reload?: string;
    };
  };
  offlineQueue?: {
    pendingActions?: string;
    replayStarted?: string;
    replaySuccess?: string;
    expiredActions?: string;
    replayPartialFailure?: string;
    queueFull?: string;
  };
  crmAccounts?: {
    title?: string;
    description?: string;
    newAccount?: string;
    editAccount?: string;
    deleteAccount?: string;
    deleteConfirm?: string;
    searchPlaceholder?: string;
    noAccountsFound?: string;
    noAccountsDescription?: string;
    columns?: {
      name?: string;
      website?: string;
      industry?: string;
      size?: string;
      revenue?: string;
      phone?: string;
      contacts?: string;
      deals?: string;
      createdAt?: string;
    };
    form?: {
      name?: string;
      namePlaceholder?: string;
      website?: string;
      websitePlaceholder?: string;
      industry?: string;
      industryPlaceholder?: string;
      size?: string;
      revenue?: string;
      currency?: string;
      phone?: string;
      phonePlaceholder?: string;
      description?: string;
      descriptionPlaceholder?: string;
      parent?: string;
      parentPlaceholder?: string;
      address?: string;
      street?: string;
      city?: string;
      state?: string;
      zip?: string;
      country?: string;
    };
    industries?: {
      technology?: string;
      healthcare?: string;
      finance?: string;
      manufacturing?: string;
      retail?: string;
      education?: string;
      consulting?: string;
      realEstate?: string;
      media?: string;
      energy?: string;
      other?: string;
    };
    sizes?: {
      '1-10'?: string;
      '11-50'?: string;
      '51-200'?: string;
      '201-500'?: string;
      '500+'?: string;
    };
    save?: string;
    cancel?: string;
    create?: string;
    created?: string;
    updated?: string;
    deleted?: string;
    detail?: {
      tabs?: {
        info?: string;
        contacts?: string;
        deals?: string;
        activity?: string;
      };
      hierarchy?: {
        title?: string;
        parent?: string;
        children?: string;
        noChildren?: string;
        setParent?: string;
        removeParent?: string;
      };
      contacts?: {
        title?: string;
        addContact?: string;
        removeContact?: string;
        removeConfirm?: string;
        noContacts?: string;
        noContactsDescription?: string;
        searchContacts?: string;
        selectContact?: string;
        linked?: string;
        unlinked?: string;
        alreadyLinked?: string;
      };
      contactRoles?: {
        label?: string;
        placeholder?: string;
        decisionMaker?: string;
        influencer?: string;
        technicalContact?: string;
        billing?: string;
        user?: string;
        champion?: string;
        other?: string;
      };
      info?: {
        editField?: string;
        noDescription?: string;
        noWebsite?: string;
        noPhone?: string;
        noAddress?: string;
        noIndustry?: string;
      };
    };
    breadcrumb?: {
      dashboard?: string;
      crm?: string;
      accounts?: string;
    };
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
