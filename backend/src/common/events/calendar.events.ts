/**
 * Domain events for the Calendar module.
 * Phase 31: Type definitions only. Wiring happens in Phase 32.
 */
export class CalendarIcsDetectedEvent {
  static readonly eventName = 'calendar.ics-detected' as const;
  constructor(
    public readonly tenantId: string,
    public readonly userId: string,
    public readonly emailId: string,
    public readonly icsData: string,
    public readonly detectedAt: Date,
  ) {}
}
