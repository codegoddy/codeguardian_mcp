/** @format */

"use client";

/** @format */
import Image from 'next/image';
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthContext } from "../contexts/AuthContext";
import { useSettings } from "@/hooks/useSettings";
import { useRecentActivities, useActivities } from "@/hooks/useActivities";
import { useNotifications, useUnreadCount, useMarkAllAsRead } from "@/hooks/useNotifications";
import { useActivityEvents, useNotificationEvents } from "@/hooks/nats";
import ClientModal from "./ui/ClientModal";
import ProjectModal from "./ui/ProjectModal";
import { Client } from "../services/clients";
import {
  Bell,
  Cog,
  Plus,
  FileText,
  Users,
  Search,
  X,
  Maximize2,
  Minimize2,
  Loader2,
} from "lucide-react";

export default function RightSidebar() {
  const { user } = useAuthContext();
  const router = useRouter();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isNotificationsExpanded, setIsNotificationsExpanded] = useState(false);
  const [isActivitiesOpen, setIsActivitiesOpen] = useState(false);
  const [isActivitiesExpanded, setIsActivitiesExpanded] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  
  // Fetch real activities and notifications from API
  const { data: activities = [], isLoading: isLoadingActivities } = useRecentActivities(5);
  const { data: allActivitiesData, isLoading: isLoadingAllActivities } = useActivities({ page_size: 50 }, isActivitiesOpen);
  const { data: notificationsData, isLoading: isLoadingNotifications } = useNotifications({ page_size: 10 }, isNotificationsOpen);
  const { data: unreadData } = useUnreadCount();
  const markAllAsReadMutation = useMarkAllAsRead();
  
  const allActivities = allActivitiesData?.items ?? [];
  const notifications = notificationsData?.items ?? [];
  const hasUnreadNotifications = (unreadData?.count ?? 0) > 0;

  // Subscribe to real-time NATS events for automatic cache updates
  useActivityEvents();  // Auto-invalidates activity cache when new activities arrive
  useNotificationEvents();  // Auto-invalidates notification cache when new notifications arrive

  // Use settings hook - data loads instantly from Redis cache on backend
  const { data: settings } = useSettings();
  
  // Derive display values with fallbacks
  const displayName = settings?.full_name || user?.fullName || "User";
  const profileImageUrl = settings?.profile_image_url || user?.profileImageUrl;
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const handleProjectCreated = (projectId: string) => {
    // Refresh projects list or show success message
    console.log('Project created successfully:', projectId);
    // You could dispatch an event or refetch data here if needed
  };

  const handleClientCreated = (client: Client) => {
    // Refresh clients list or show success message
    console.log('Client created successfully:', client.id);
    // You could dispatch an event or refetch data here if needed
  };

  // Helper function to format time ago
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };
  
  // Handle mark all as read
  const handleMarkAllAsRead = () => {
    markAllAsReadMutation.mutate();
  };



  const getActivityIcon = (type: string) => {
    const borderColorClass = {
      commit: "border-blue-400",
      invoice: "border-green-400",
      deliverable: "border-purple-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  const getNotificationIcon = (type: string) => {
    const borderColorClass = {
      notification: "border-blue-400",
      alert: "border-red-400",
      update: "border-green-400",
      default: "border-gray-400",
    };
    const borderColor = borderColorClass[type as keyof typeof borderColorClass] || borderColorClass.default;
    return <div className={`w-3 h-3 bg-white rounded-full border-2 ${borderColor}`}></div>;
  };

  return (
    <div className="hidden lg:fixed lg:right-0 lg:top-0 lg:z-50 lg:flex lg:w-96 lg:flex-col lg:h-screen">
      <div className="flex flex-col h-full bg-white">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <Search className="w-5 h-5 text-gray-600 cursor-pointer" />
          </div>
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Bell className="w-5 h-5 text-gray-600 cursor-pointer transition-all duration-200 hover:scale-110" onClick={() => setIsNotificationsOpen(!isNotificationsOpen)} />
              {hasUnreadNotifications && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-red-500 rounded-full"></div>
              )}
            </div>
            <span className="text-sm font-medium text-black">
              {displayName}
            </span>
            {profileImageUrl ? (
              <Image 
                src={profileImageUrl} 
                alt={displayName} 
                width={32} 
                height={32} 
                className="w-8 h-8 rounded-full object-cover"
                style={{ border: '1px solid #171717' }}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center" style={{ border: '1px solid #171717' }}>
                <span className="text-white font-semibold text-xs">
                  {initials}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6">
          {/* Quick Actions */}
          <div className="pb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-normal text-black">
                Quick Actions
              </h2>
              <Plus className="w-5 h-5 text-gray-600" />
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setIsProjectModalOpen(true)}
                className="flex items-center px-4 py-2 text-sm font-medium email-button w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </button>
              <button
                onClick={() => setIsClientModalOpen(true)}
                className="flex items-center px-4 py-2 text-sm font-medium purple-button w-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Add Client
              </button>
              <button
                onClick={() => router.push("/invoices")}
                className="flex items-center px-4 py-2 text-sm font-medium black-button w-full"
              >
                <FileText className="h-4 w-4 mr-2" />
                View Invoices
              </button>
            </div>
          </div>

          {/* Activities Section */}
          <div className="py-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-normal text-black">
                Activities
              </h2>
              <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                <Cog className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              {isLoadingActivities ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : activities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out"
                  >
                    <div className="flex-shrink-0 flex flex-col items-center">
                      <div className="mt-0.5">
                        {getActivityIcon(activity.activity_type)}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-normal text-black truncate">
                        {activity.title}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {formatTimeAgo(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Show All Activities Button */}
          <div className="pb-6">
            <button 
              onClick={() => setIsActivitiesOpen(true)}
              className="px-4 py-2 text-sm font-medium black-button w-full"
            >
              Show All Activities
            </button>
          </div>

          {/* Bottom Section - Empty now */}
        </div>
      </div>

      {/* Backdrop overlay when notifications or activities expanded */}
      {((isNotificationsOpen && isNotificationsExpanded) || (isActivitiesOpen && isActivitiesExpanded)) && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300"
          onClick={() => {
            setIsNotificationsExpanded(false);
            setIsActivitiesExpanded(false);
          }}
        />
      )}

      {/* Notifications Panel */}
      <div className={`hidden lg:fixed lg:top-0 lg:right-0 lg:h-screen lg:bg-white lg:flex lg:flex-col lg:shadow-lg transition-all duration-300 ease-in-out ${
        isNotificationsOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isNotificationsExpanded ? 'lg:w-[800px] lg:z-50' : 'lg:w-96 lg:z-60'}`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-normal text-black">
            Notifications
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsNotificationsExpanded(!isNotificationsExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title={isNotificationsExpanded ? "Collapse" : "Expand"}
            >
              {isNotificationsExpanded ? (
                <Minimize2 className="w-5 h-5 text-gray-600" />
              ) : (
                <Maximize2 className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              onClick={() => {
                setIsNotificationsOpen(false);
                setIsNotificationsExpanded(false);
              }}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {/* Mark All as Read Button */}
          <div className="pb-6">
            <button
              onClick={handleMarkAllAsRead}
              disabled={markAllAsReadMutation.isPending}
              className="px-4 py-2 text-sm font-medium black-button w-full disabled:opacity-50"
            >
              Mark All as Read
            </button>
          </div>
          {isLoadingNotifications ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No notifications</p>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                className={`flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out mb-4 ${notification.is_read ? 'opacity-60' : ''}`}
              >
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="mt-0.5">
                    {getNotificationIcon(notification.notification_type)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-normal text-black truncate">
                    {notification.message}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {formatTimeAgo(notification.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Activities Panel */}
      <div className={`hidden lg:fixed lg:top-0 lg:right-0 lg:h-screen lg:bg-white lg:flex lg:flex-col lg:shadow-lg transition-all duration-300 ease-in-out ${
        isActivitiesOpen ? 'translate-x-0' : 'translate-x-full'
      } ${isActivitiesExpanded ? 'lg:w-[800px] lg:z-50' : 'lg:w-96 lg:z-60'}`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-normal text-black">
            All Activities
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsActivitiesExpanded(!isActivitiesExpanded)}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
              title={isActivitiesExpanded ? "Collapse" : "Expand"}
            >
              {isActivitiesExpanded ? (
                <Minimize2 className="w-5 h-5 text-gray-600" />
              ) : (
                <Maximize2 className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <button
              onClick={() => {
                setIsActivitiesOpen(false);
                setIsActivitiesExpanded(false);
              }}
              className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {isLoadingAllActivities ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : allActivities.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No activities</p>
          ) : (
            allActivities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start space-x-2 relative hover:scale-105 transform transition-all duration-300 ease-in-out mb-4"
              >
                <div className="flex-shrink-0 flex flex-col items-center">
                  <div className="mt-0.5">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-black">
                    {activity.title}
                  </p>
                  {activity.description && (
                    <p className="text-sm text-gray-600">
                      {activity.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTimeAgo(activity.created_at)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Client Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onClientCreated={handleClientCreated}
      />

      {/* Project Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />
    </div>
  );
}
