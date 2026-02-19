/**
 * NATS Event Client via WebSocket Proxy
 * 
 * Connects to backend WebSocket endpoint to receive NATS events,
 * since direct NATS connection is not available in production.
 */

// Event types (preserved from original)
export interface CommitReviewEvent {
  event_type: 'commit_review_pending' | 'bulk_reviews_submitted';
  timestamp: string;
  data: {
    commit_hash?: string;
    deliverable_id?: number;
    parsed_hours?: number;
    status?: string;
    repository?: string;
    provider?: string;
    user_id?: number;
    review_count?: number;
    error_count?: number;
  };
}

export interface BudgetAlertEvent {
  event_type: 'budget_alert';
  timestamp: string;
  data: {
    deliverable_id: number;
    project_id: number;
    deliverable_name: string;
    estimated_hours: number;
    actual_hours: number;
    usage_percentage: number;
    variance: number;
    alert_level: 'low' | 'medium' | 'high' | 'critical';
    message: string;
  };
}

export interface TimeEntryEvent {
  event_type: 'time_entry_created';
  timestamp: string;
  data: {
    entry_id: number;
    deliverable_id: number;
    project_id: number;
    hours: number;
    entry_type: 'commit' | 'manual';
    commit_hash?: string;
    notes?: string;
    user_id: number;
  };
}

export interface ReviewReminderEvent {
  event_type: 'review_reminder';
  timestamp: string;
  data: {
    user_id: number;
    pending_count: number;
    oldest_review_age: number;
    project_ids: number[];
  };
}

export interface ContractSignedEvent {
  event_type: 'contract_signed';
  timestamp: string;
  data: {
    project_id: number;
    client_id: number;
    contract_id: number;
    message: string;
  };
}

export interface ContractGeneratedEvent {
  event_type: 'contract_generated';
  timestamp: string;
  data: {
    project_id: number;
    contract_id: number;
    user_id: number;
    message: string;
  };
}

export interface SessionStoppedEvent {
  event_type: 'session_stopped';
  timestamp: string;
  data: {
    session_id: string;
    user_id: string;
    deliverable_id: string;
    project_id: string;
    duration_minutes: number;
    tracking_code?: string;
  };
}

export interface ActivityCreatedEvent {
  event_type: 'activity_created';
  timestamp: string;
  user_id: string;
  activity: {
    id: string;
    entity_type: string;
    entity_id: string;
    action: string;
    title: string;
    description?: string;
    activity_type: string;
    created_at: string;
  };
}

export interface NotificationCreatedEvent {
  event_type: 'notification_created';
  timestamp: string;
  user_id: string;
  notification: {
    id: string;
    notification_type: string;
    title: string;
    message: string;
    action_url?: string;
    created_at: string;
  };
}

export type NatsEvent = CommitReviewEvent | BudgetAlertEvent | TimeEntryEvent | ReviewReminderEvent | ContractSignedEvent | ContractGeneratedEvent | SessionStoppedEvent | ActivityCreatedEvent | NotificationCreatedEvent;

// Callback types
export type CommitReviewCallback = (event: CommitReviewEvent) => void;
export type BudgetAlertCallback = (event: BudgetAlertEvent) => void;
export type TimeEntryCallback = (event: TimeEntryEvent) => void;
export type ReviewReminderCallback = (event: ReviewReminderEvent) => void;
export type ContractSignedCallback = (event: ContractSignedEvent) => void;
export type ContractGeneratedCallback = (event: ContractGeneratedEvent) => void;
export type SessionStoppedCallback = (event: SessionStoppedEvent) => void;
export type ActivityCreatedCallback = (event: ActivityCreatedEvent) => void;
export type NotificationCreatedCallback = (event: NotificationCreatedEvent) => void;

/**
 * NATS Client using WebSocket Proxy
 * Connects to backend's /api/ws/events endpoint
 */
export class TimeTrackingNATSClient {
  private websocket: WebSocket | null = null;
  private callbacks: Map<string, Set<(event: NatsEvent) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 2000;
  private isConnecting = false;
  private pingInterval: NodeJS.Timeout | null = null;

  /**
   * Connect to backend WebSocket endpoint
   */
  async connect(url?: string): Promise<void> {
    if (this.websocket?.readyState === WebSocket.OPEN || this.isConnecting) {
      console.log('[NATS WS] Already connected or connecting');
      return;
    }

    this.isConnecting = true;

    try {
      // Build WebSocket URL
      const wsUrl = this.buildWebSocketUrl(url);
      console.log(`[NATS WS] Connecting to ${wsUrl}...`);

      this.websocket = new WebSocket(wsUrl);

      // Set up event handlers
      this.websocket.onopen = () => {
        console.log('[NATS WS] Connected successfully');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        
        // Start ping/pong to keep connection alive
        this.startPing();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle pong
          if (data.type === 'pong') {
            return;
          }
          
          // Handle warnings
          if (data.type === 'warning') {
            console.warn('[NATS WS]', data.message);
            return;
          }
          
          // Handle NATS events
          this.handleEvent(data as NatsEvent);
        } catch (error) {
          console.error('[NATS WS] Error parsing message:', error);
        }
      };

      this.websocket.onerror = (error) => {
        console.error('[NATS WS] WebSocket error:', error);
        this.isConnecting = false;
      };

      this.websocket.onclose = () => {
        console.log('[NATS WS] Connection closed');
        this.isConnecting = false;
        this.stopPing();
        
        // Attempt reconnection
        this.attemptReconnect(url);
      };

      // Wait for connection to open
      await this.waitForConnection();
      
    } catch (error) {
      this.isConnecting = false;
      console.error('[NATS WS] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Build WebSocket URL from API URL
   */
  private buildWebSocketUrl(url?: string): string {
    if (url) {
      console.log('[NATS WS] Using provided URL:', url);
      return url;
    }

    // Get API URL from env
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    console.log('[NATS WS] API URL from env:', apiUrl);
    
    // Convert to WebSocket URL
    const wsUrl = apiUrl
      .replace('http://', 'ws://')
      .replace('https://', 'wss://');
    
    const finalUrl = `${wsUrl}/api/ws/events`;
    console.log('[NATS WS] Built WebSocket URL:', finalUrl);
    
    return finalUrl;
  }

  /**
   * Wait for WebSocket connection to open
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.websocket) {
        reject(new Error('WebSocket not initialized'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      const checkState = () => {
        if (this.websocket?.readyState === WebSocket.OPEN) {
          clearTimeout(timeout);
          resolve();
        } else if (this.websocket?.readyState === WebSocket.CLOSED) {
          clearTimeout(timeout);
          reject(new Error('Connection closed'));
        } else {
          setTimeout(checkState, 100);
        }
      };

      checkState();
    });
  }

  /**
   * Start ping interval to keep connection alive
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.websocket?.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Stop ping interval
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(url?: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[NATS WS] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[NATS WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      this.connect(url);
    }, delay);
  }

  /**
   * Handle incoming NATS event
   */
  private handleEvent(event: NatsEvent): void {
    console.log('[NATS WS] Received event:', event);

    // Get callbacks for this event type
    const eventCallbacks = this.callbacks.get(event.event_type);
    if (eventCallbacks) {
      eventCallbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error) {
          console.error('[NATS WS] Error in event callback:', error);
        }
      });
    }
  }

  /**
   * Subscribe to commit review events
   */
  async subscribeToCommitReviews(callback: CommitReviewCallback): Promise<void> {
    this.addCallback('commit_review_pending', callback as (event: NatsEvent) => void);
    this.addCallback('bulk_reviews_submitted', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to budget alert events
   */
  async subscribeToBudgetAlerts(callback: BudgetAlertCallback): Promise<void> {
    this.addCallback('budget_alert', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to time entry events
   */
  async subscribeToTimeEntries(callback: TimeEntryCallback): Promise<void> {
    this.addCallback('time_entry_created', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to review reminder events
   */
  async subscribeToReviewReminders(callback: ReviewReminderCallback): Promise<void> {
    this.addCallback('review_reminder', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to contract signed events
   */
  async subscribeToContractSigned(callback: ContractSignedCallback): Promise<void> {
    this.addCallback('contract_signed', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to contract generated events
   */
  async subscribeToContractGenerated(callback: ContractGeneratedCallback): Promise<void> {
    this.addCallback('contract_generated', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to session stopped events
   */
  async subscribeToSessionStopped(callback: SessionStoppedCallback): Promise<void> {
    this.addCallback('session_stopped', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to activity created events
   */
  async subscribeToActivityCreated(callback: ActivityCreatedCallback): Promise<void> {
    this.addCallback('activity_created', callback as (event: NatsEvent) => void);
  }

  /**
   * Subscribe to notification created events
   */
  async subscribeToNotificationCreated(callback: NotificationCreatedCallback): Promise<void> {
    this.addCallback('notification_created', callback as (event: NatsEvent) => void);
  }

  /**
   * Add callback for event type
   */
  private addCallback(eventType: string, callback: (event: NatsEvent) => void): void {
    if (!this.callbacks.has(eventType)) {
      this.callbacks.set(eventType, new Set());
    }
    this.callbacks.get(eventType)!.add(callback);
  }

  /**
   * Disconnect from WebSocket
   */
  async disconnect(): Promise<void> {
    this.stopPing();
    
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    this.callbacks.clear();
    console.log('[NATS WS] Disconnected successfully');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.websocket?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection status
   */
  getStatus(): string {
    if (!this.websocket) return 'disconnected';
    
    switch (this.websocket.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'closed';
      default:
        return 'unknown';
    }
  }
}

// Singleton instance
let natsClient: TimeTrackingNATSClient | null = null;

/**
 * Get or create the NATS client singleton
 */
export function getNATSClient(): TimeTrackingNATSClient {
  if (!natsClient) {
    natsClient = new TimeTrackingNATSClient();
  }
  return natsClient;
}

/**
 * Initialize and connect to NATS via WebSocket proxy
 */
export async function initNATS(url?: string): Promise<TimeTrackingNATSClient> {
  const client = getNATSClient();
  
  if (!client.isConnected()) {
    await client.connect(url);
  }
  
  return client;
}

/**
 * Disconnect from NATS
 */
export async function disconnectNATS(): Promise<void> {
  if (natsClient) {
    await natsClient.disconnect();
    natsClient = null;
  }
}

export default TimeTrackingNATSClient;
