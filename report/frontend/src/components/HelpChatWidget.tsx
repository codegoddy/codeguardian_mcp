"use client";

/**
 * HelpChatWidget - AI-powered support chat widget
 * Light theme, floating bottom-right, card-based UI
 */

import { useState, useEffect, useRef } from "react";
import {
  X,
  Send,
  MessageSquare,
  ArrowLeft,
  MoreHorizontal,
  Home,
  MessageCircle,
  CheckCircle2,
  Paperclip,
  Smile,
  ExternalLink
} from "lucide-react";
import { useAuthContext } from "../contexts/AuthContext";
import supportChatService, {
  ChatMessage,
  Conversation,
} from "../services/supportChat";
import { Logo } from "./Logo";

// Typing indicator component
const TypingIndicator = () => (
  <div className="flex space-x-1 p-2 bg-gray-100 rounded-2xl rounded-bl-none w-fit">
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
  </div>
);

interface HelpChatWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpChatWidget({ isOpen, onClose }: HelpChatWidgetProps) {
  const { user } = useAuthContext();
  const [view, setView] = useState<"home" | "messages" | "chat">("home");
  const [activeTab, setActiveTab] = useState<"home" | "messages">("home");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await supportChatService.getConversations();
      setConversations(response.conversations || []);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage, timestamp: new Date().toISOString() },
    ]);

    try {
      const response = await supportChatService.sendMessage(userMessage);
      setMessages(response.messages);
      setConversationId(response.conversation_id);
    } catch (error) {
      console.error("Failed to send message:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't process your message. Please try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStartNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setView("chat");
  };

  const handleLoadConversation = async (convId: string) => {
    try {
      setIsLoading(true);
      const conversation = await supportChatService.getConversation(convId);
      setMessages(conversation.messages);
      setConversationId(convId);
      setView("chat");
    } catch (error) {
      console.error("Failed to load conversation:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserFirstName = () => {
    if (!user?.fullName) return "there";
    return user.fullName.split(" ")[0];
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed right-6 bottom-6 z-50 flex flex-col w-[380px] h-[650px] max-h-[calc(100vh-48px)] bg-white text-gray-900 shadow-2xl transition-all duration-300 ease-in-out rounded-3xl border border-gray-100 overflow-hidden font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white z-10">
        <div className="flex items-center gap-3">
          {view === "chat" ? (
             <button
             onClick={() => {
               setView(activeTab); // Return to previous tab view
             }}
             className="p-1 hover:bg-gray-100 rounded-full transition-colors"
           >
             <ArrowLeft className="w-5 h-5 text-gray-600" />
           </button>
          ) : (
             <div className="w-8 h-8 flex items-center justify-center">
              <Logo className="[&_svg]:w-8 [&_svg]:h-8 [&_span]:hidden" />
            </div>
          )}
         
          <div className="flex flex-col">
             <h3 className="font-bold text-base leading-tight">DevHQ</h3>
             {view === "chat" && <span className="text-xs text-gray-500">The team can also help</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
           <button className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
            <MoreHorizontal className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/50">
        
        {/* HOMEPAGE VIEW */}
        {view === "home" && (
          <div className="flex-1 overflow-y-auto px-6 py-2 pb-20">
            {/* Greeting */}
            <div className="mb-8 mt-4">
              <h2 className="text-3xl font-bold text-gray-900 mb-1">
                Hi {getUserFirstName()} 👋
              </h2>
              <h2 className="text-3xl font-bold text-gray-900">
                How can we help?
              </h2>
            </div>
            
             {/* Status Card */}
             <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                <div>
                   <p className="text-sm font-semibold">Status: All Systems Operational</p>
                   <p className="text-xs text-gray-500">Updated Dec 11, 12:51 UTC</p>
                </div>
             </div>

             {/* Send Message Button */}
             <button 
                onClick={handleStartNewConversation}
                className="w-full bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 flex items-center justify-between hover:shadow-md transition-shadow group"
             >
                <span className="font-semibold text-sm">Send us a message</span>
                <Send className="w-4 h-4 text-gray-900 group-hover:translate-x-1 transition-transform" />
             </button>

             {/* Documentation Button */}
             <a 
                href="https://www.devhq.site/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 flex items-center justify-between hover:shadow-md transition-shadow group"
             >
                <span className="text-sm text-gray-700">Documentation</span>
                <ExternalLink className="w-4 h-4 text-gray-900" />
             </a>
          </div>
        )}

        {/* MESSAGES VIEW */}
        {view === "messages" && (
           <div className="flex-1 overflow-y-auto px-6 py-2 pb-24 relative">
              <div className="flex items-center justify-between mb-4">
                 <h2 className="text-lg font-bold">Messages</h2>
                 <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                   {/* Optional secondary close or filter */}
                 </button>
              </div>

              {isLoadingHistory ? (
                 <div className="flex justify-center py-10">
                    <div className="animate-spin w-6 h-6 border-2 border-black border-t-transparent rounded-full"></div>
                 </div>
              ) : conversations.length === 0 ? (
                 <div className="text-center py-10 text-gray-500">
                    <p>No messages yet.</p>
                 </div>
              ) : (
                 <div className="space-y-3">
                    {conversations.map((conv) => (
                       <div 
                          key={conv.id}
                          onClick={() => handleLoadConversation(conv.id)}
                          className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow flex items-start justify-between group"
                       >
                          <div className="flex items-center gap-3 overflow-hidden">
                             <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
                                <Logo className="[&_svg]:w-10 [&_svg]:h-10 [&_span]:hidden" />
                             </div>
                             <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                   {conv.last_message || "New Conversation"}
                                </p>
                                <p className="text-xs text-gray-500">
                                   DevHQ • {new Date(conv.updated_at || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                             </div>
                          </div>
                          {/* Unread indicator mockup */}
                          <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                       </div>
                    ))}
                 </div>
              )}

              {/* Floating Send Message Button */}
              <div className="absolute bottom-6 left-0 right-0 px-6 flex justify-center">
                 <button 
                    onClick={handleStartNewConversation}
                    className="bg-black text-white px-6 py-3 rounded-full shadow-lg hover:bg-gray-900 transition-colors flex items-center gap-2 text-sm font-medium"
                 >
                    <span>Send us a message</span>
                    <Send className="w-3 h-3" />
                 </button>
              </div>
           </div>
        )}

        {/* CHAT VIEW */}
        {view === "chat" && (
          <div className="flex flex-col h-full bg-white">
             {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {messages.length === 0 && (
                 <div className="text-center py-10">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                       <MessageSquare className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-sm">We&apos;re here to help you to be successful on DevHQ.</p>
                 </div>
              )}
              
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-3 text-sm shadow-sm ${
                      msg.role === "user"
                        ? "bg-black text-white rounded-2xl rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                   <TypingIndicator />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white border-t border-gray-50">
               <div className="relative border border-black rounded-3xl bg-white px-4 py-3 flex items-center gap-2 focus-within:ring-1 focus-within:ring-black/50 transition-shadow">
                  <input
                     type="text"
                     value={inputValue}
                     onChange={(e) => setInputValue(e.target.value)}
                     onKeyPress={handleKeyPress}
                     placeholder="Message..."
                     className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-400"
                     disabled={isLoading}
                  />
                  <div className="flex items-center gap-2 text-gray-400">
                     <Paperclip className="w-4 h-4 cursor-pointer hover:text-gray-600" />
                     <Smile className="w-4 h-4 cursor-pointer hover:text-gray-600" />
                     <button 
                        onClick={handleSendMessage}
                        disabled={!inputValue.trim() || isLoading}
                        className={`p-1 rounded-full transition-all ${inputValue.trim() ? 'bg-black text-white' : 'bg-gray-200 text-gray-400'}`}
                     >
                        <Send className="w-3 h-3" />
                     </button>
                  </div>
               </div>
            </div>
          </div>
        )}

      </div>

      {/* Bottom Navigation */}
      {view !== "chat" && (
        <div className="bg-white border-t border-gray-100 px-6 py-2 flex justify-between items-center h-16 absolute bottom-0 w-full rounded-b-3xl">
           <button 
              onClick={() => {
                 setActiveTab("home");
                 setView("home");
              }}
              className={`flex flex-col items-center gap-1 w-1/2 ${activeTab === "home" ? "text-black" : "text-gray-400"}`}
           >
              <Home className={`w-6 h-6 ${activeTab === "home" ? "fill-current" : ""}`} />
              <span className="text-xs font-medium">Home</span>
           </button>
           <button 
              onClick={() => {
                 setActiveTab("messages");
                 setView("messages");
              }}
              className={`flex flex-col items-center gap-1 w-1/2 ${activeTab === "messages" ? "text-black" : "text-gray-400"}`}
           >
              <div className="relative">
                 <MessageCircle className={`w-6 h-6 ${activeTab === "messages" ? "fill-current" : ""}`} />
                 <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full border border-white">1</span>
              </div>
              <span className="text-xs font-medium">Messages</span>
           </button>
        </div>
      )}
    </div>
  );
}
