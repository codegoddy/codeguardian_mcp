"use client";

/** @format */

import { Bell, Menu } from "lucide-react";
import { useAuthContext } from "../contexts/AuthContext";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useSettings } from "@/hooks/useSettings";

interface HeaderProps {
  onMenuClick?: () => void;
}

export default function Header({ onMenuClick }: HeaderProps = {}) {
  const { user } = useAuthContext();

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  
  // Use settings hook to get profile data (includes full_name and profile_image_url)
  const { data: settings } = useSettings();

  // Fetch unread notifications count
  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        // TODO: Replace with actual API call when notifications endpoint is available
        // const response = await notificationsApi.getUnreadCount();
        // setUnreadNotifications(response.count);
        
        // Mock data for now
        setUnreadNotifications(3);
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      }
    };

    if (user) {
      fetchNotifications();
    }
  }, [user]);

  const getInitials = (name: string | undefined) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <header className="lg:pl-64 sticky top-0 z-30" style={{ backgroundColor: '#F5F5F5' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 sm:py-4">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-gray-700 hover:text-gray-900 border-2 border-black rounded-md shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-[2px] active:shadow-none transition-all"
            aria-label="Open menu"
          >
            <Menu className="h-6 w-6" />
          </button>


          <div className="lg:hidden bg-white rounded-full p-2 sm:p-3 flex items-center space-x-3 sm:space-x-8">
            {/* Notification Bell with Badge */}
            <button className="relative text-gray-700 hover:text-gray-900 hover:scale-110 transition-transform duration-200">
              <Bell className="h-5 w-5 sm:h-6 sm:w-6" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-4 w-4 sm:h-5 sm:w-5 flex items-center justify-center text-[10px] sm:text-xs">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </button>

            {/* Profile Image or Initials */}
            <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full hover:scale-110 transition-transform duration-200 cursor-pointer overflow-hidden">
              {settings?.profile_image_url ? (
                <Image
                  src={settings.profile_image_url}
                  alt={settings.full_name || "User profile"}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-500 flex items-center justify-center">
                  <span className="text-white font-semibold text-xs sm:text-sm">
                    {getInitials(settings?.full_name || user?.fullName)}
                  </span>
                </div>
              )}
            </div>

            {/* User Name - Hidden on mobile */}
            <span className="hidden md:block text-gray-700 font-medium text-sm ml-2">
              {settings?.full_name || user?.fullName || user?.email}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
