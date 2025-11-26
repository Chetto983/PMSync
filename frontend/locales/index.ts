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

export interface AppTranslations {
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
    invalidToken: string;
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
        recentConnections: string;
        recentConnectionsSubtitle: string;
        noRecentContacts: string;
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
        labelsFailed: string;
        moved: string;
        moveFailed: string;
        loadLabelsFailed: string;
        selectedCount: string;
        move: string;
        emailSent: string;
      };
      composer: {
        title: string;
        titleReply: string;
        titleForward: string;
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
        draftSaved: string;
        discardConfirm: string;
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
        // AI Search tab
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
    emailList: {
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
    realtime?: {
      connecting?: string;
      live?: string;
      reconnecting?: string;
      disconnectedNotice?: string;
    };
    empty?: {
      defaultTitle?: string;
      defaultSubtitle?: string;
      trashTitle?: string;
      trashSubtitle?: string;
      sentTitle?: string;
      sentSubtitle?: string;
      unreadTitle?: string;
      unreadSubtitle?: string;
      labelTitle?: string;
      labelSubtitle?: string;
    };
    emailView: {
      folderLabel: string;
      attachments: string;
      attachmentsTooltip?: string;
      fetchArchived?: string;
      to: string;
      cc: string;
      labels: string;
      date: string;
      selectEmail: string;
      back: string;
      archive: string;
      more: string;
      download: string;
      reply: string;
      replyAll: string;
      forward: string;
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
    actions?: {
      syncNow?: string;
      runRetention?: string;
      compose?: string;
    };
    calendar: {
      title: string;
      description: string;
      refreshTooltip: string;
      allCalendars: string;
      clearSelection: string;
      filterTitle?: string;
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
      // Validation messages
      validation: {
        titleRequired: string;
        startRequired: string;
        endRequired: string;
        endAfterStart: string;
        duplicateEvent: string;
      };
      // UI labels
      changeColor: string;
      attachments: string;
      download: string;
      close: string;
      allDay: string;
      noCalendarsFound: string;
      failedToDownloadAttachment: string;
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
      };
    };
    settings: {
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
        empty: string;
        manage: string;
        add: string;
        refresh: string;
        defaultBadge: string;
        emailBadge: string;
        calendarBadge: string;
        contactsBadge: string;
        lastSyncPrefix: string;
        neverSynced: string;
        connectedProviders: string;
        connectedProvidersSubtitle: string;
        providerTypes: Record<string, string>;
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
        smartReplies: string;
        smartRepliesDescription: string;
        summarization: string;
        summarizationDescription: string;
        scheduling: string;
        schedulingDescription: string;
        save: string;
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
        profileInformation: string;
        fullName: string;
        email: string;
        role: string;
        readOnlyNotice: string;
        dangerTitle: string;
        dangerDescription: string;
        deleteCta: string;
      };
      notificationsPanel: {
        title: string;
        description: string;
        emailToggle: string;
      };
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
        // Extended create dialog
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
      // UI labels
      edit: string;
      close: string;
    };
    tasks: {
      title: string;
      workspace: string;
      allTasks: string;
      today: string;
      upcoming: string;
      myProjects: string;
      addNewList: string;
      filter: string;
      newTask: string;
      addTaskPlaceholder: string;
      taskDetails: string;
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
  ai?: {
    title: string;
    subtitle: string;
    welcome: string;
    description: string;
    inputPlaceholder: string;
    thinking: string;
    online: string;
    pendingActions: string;
    history: string;
    noHistory: string;
    noPendingActions: string;
    approve: string;
    reject: string;
    confidence: string;
    tips: string;
  };
  emailAi?: {
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
      generate: string;
    };
    categorization: {
      title: string;
      suggested: string;
      apply: string;
      dismiss: string;
      confidence: string;
    };
  };
  calendarAi?: {
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
    };
    availability: {
      title: string;
      checking: string;
      available: string;
      busy: string;
      attendees: string;
    };
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
