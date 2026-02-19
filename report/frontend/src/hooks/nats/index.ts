/**
 * NATS JetStream React Hooks
 * 
 * Modular hooks for subscribing to different NATS event streams.
 * Each hook manages its own subscription lifecycle.
 */

// Connection management
export { useNATSConnection } from './useNATSConnection';
export type { 
  UseNATSConnectionOptions, 
  UseNATSConnectionReturn 
} from './useNATSConnection';

// Event-specific hooks
export { useCommitReviews } from './useCommitReviews';
export type {
  UseCommitReviewsOptions,
  UseCommitReviewsReturn,
} from './useCommitReviews';

export { useBudgetAlerts } from './useBudgetAlerts';
export type {
  UseBudgetAlertsOptions,
  UseBudgetAlertsReturn,
} from './useBudgetAlerts';

export { useTimeEntries } from './useTimeEntries';
export type {
  UseTimeEntriesOptions,
  UseTimeEntriesReturn,
} from './useTimeEntries';

export { useReviewReminders } from './useReviewReminders';
export type {
  UseReviewRemindersOptions,
  UseReviewRemindersReturn,
} from './useReviewReminders';

export { useContractSigned } from './useContractSigned';
export type {
  UseContractSignedOptions,
  UseContractSignedReturn,
} from './useContractSigned';

export { useActivityEvents } from './useActivityEvents';
export type {
  UseActivityEventsOptions,
  UseActivityEventsReturn,
} from './useActivityEvents';

export { useNotificationEvents } from './useNotificationEvents';
export type {
  UseNotificationEventsOptions,
  UseNotificationEventsReturn,
} from './useNotificationEvents';

// Re-export types from the NATS service
export type {
  CommitReviewEvent,
  BudgetAlertEvent,
  TimeEntryEvent,
  ReviewReminderEvent,
  ContractSignedEvent,
  ActivityCreatedEvent,
  NotificationCreatedEvent,
  NatsEvent,
} from '@/services/nats';




