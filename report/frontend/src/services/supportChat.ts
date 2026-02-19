/**
 * Support Chat Service
 * API client for AI-powered support chat
 */

import { ApiService } from './api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatResponse {
  message: string;
  conversation_id: string;
  messages: ChatMessage[];
}

export interface Conversation {
  id: string;
  title: string | null;
  message_count: number;
  last_message: string | null;
  updated_at: string | null;
}

export interface ConversationDetail {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  created_at: string;
  updated_at: string;
}

export const supportChatService = {
  /**
   * Send a message to the AI support assistant
   */
  async sendMessage(message: string): Promise<ChatResponse> {
    return ApiService.post<ChatResponse>('/api/support/chat', { message });
  },

  /**
   * Get list of recent conversations (last 30 days)
   */
  async getConversations(): Promise<{ conversations: Conversation[] }> {
    return ApiService.get<{ conversations: Conversation[] }>('/api/support/conversations');
  },

  /**
   * Get a specific conversation by ID
   */
  async getConversation(conversationId: string): Promise<ConversationDetail> {
    return ApiService.get<ConversationDetail>(`/api/support/conversations/${conversationId}`);
  },

  /**
   * Start a new conversation
   */
  async startNewConversation(): Promise<ConversationDetail> {
    return ApiService.post<ConversationDetail>('/api/support/conversations/new');
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    return ApiService.delete(`/api/support/conversations/${conversationId}`);
  },
};

export default supportChatService;
