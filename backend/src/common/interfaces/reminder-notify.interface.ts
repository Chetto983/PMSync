/**
 * Interface token for ReminderNotifyQueueService.
 * Breaks the circular dependency: ReminderModule -> TelegramModule -> AiChatModule -> ReminderModule.
 * TelegramModule provides the implementation, ReminderModule injects via token.
 */
export const REMINDER_NOTIFY_QUEUE = Symbol('REMINDER_NOTIFY_QUEUE');

export interface IReminderNotifyQueue {
  scheduleNotification(reminderId: string, notifyAt: Date): Promise<void>;
  cancelNotification(reminderId: string): Promise<void>;
}
