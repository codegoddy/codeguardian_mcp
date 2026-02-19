/** @format */

"use client";

/** @format */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthContext } from "../contexts/AuthContext";
import { useState, useEffect } from "react";
import {
  Users,
  Clock,
  FileText,
  CreditCard,
  Settings,
  Link as LinkIcon,
  Home,
  LayoutDashboard,
  LogOut,
  HelpCircle,
  X,
} from "lucide-react";
import { Logo } from "./Logo";

const navigationItems = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: Home },
  { name: "Clients", href: "/clients", icon: Users },
  { name: "Time Tracker", href: "/time-tracker", icon: Clock },
  { name: "Invoices & Billing", href: "/invoices", icon: FileText },
  { name: "Payments & Budget", href: "/payments", icon: CreditCard },
  { name: "Integrations", href: "/integrations", icon: LinkIcon },
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  onHelpClick?: () => void;
}

export default function Sidebar({
  isOpen = false,
  onClose,
  onHelpClick,
}: SidebarProps = {}) {
  const pathname = usePathname();
  const { logout } = useAuthContext();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    setIsMobileOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    setIsMobileOpen(false);
    onClose?.();
  }, [pathname, onClose]);

  const handleClose = () => {
    setIsMobileOpen(false);
    onClose?.();
  };

  const isActive = (href: string) => {
    if (href === "/projects") {
      return pathname === "/projects";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={handleClose}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
        fixed left-4 top-1/2 -translate-y-1/2 z-50 flex w-72 flex-col max-h-[96vh] transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}
      >
        {/* Rounded container with black background */}
        <div className="flex flex-col h-full bg-black rounded-[32px] overflow-hidden shadow-2xl">
          {/* Mobile Close Button */}
          <div className="lg:hidden flex items-center justify-between px-6 py-4">
            <h2 className="text-lg font-bold text-[#CCFF00]">Menu</h2>
            <button
              onClick={handleClose}
              className="p-2 text-gray-300 hover:text-white transition-colors"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Navigation - Content fit */}
          <div className="flex flex-col h-full px-4 py-6 overflow-y-auto custom-scrollbar">
            {/* Logo */}
            <div className="flex justify-center pb-4">
              <Logo variant="dark" className="[&_svg]:w-8 [&_svg]:h-8" />
            </div>
            
            <nav className="space-y-1">
              <ul role="list" className="space-y-1">
                {navigationItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => handleClose()}
                        className={`
                          group flex items-center gap-3 px-6 py-3 text-sm font-semibold rounded-full transition-all duration-300
                          ${
                            active
                              ? "bg-[#CCFF00] text-[#101010] shadow-[0_0_20px_rgba(204,255,0,0.3)] scale-[1.02]"
                              : "text-gray-400 hover:text-white hover:bg-white/5 hover:scale-[1.02]"
                          }
                        `}
                        title={item.name}
                      >
                        <Icon 
                          className={`w-5 h-5 transition-transform duration-300 ${
                            active ? "scale-110" : "group-hover:scale-110"
                          }`} 
                        />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Bottom Section - Help & Logout */}
            <div className="mt-2 space-y-2">
              {/* Help & Support */}
              {/* Help & Support */}
              <button
                onClick={() => {
                  onHelpClick?.();
                  handleClose();
                }}
                className="w-full flex items-center gap-3 px-6 py-3 text-sm font-semibold rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-200 group"
              >
                <div className="p-1 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                   <div className="w-1.5 h-1.5 rounded-full bg-current" />
                </div>
                Help & Support
              </button>

              {/* Logout Button */}
              {/* Logout Button */}
              <button
                onClick={() => {
                  logout();
                  handleClose();
                }}
                className="group w-full flex items-center justify-between px-6 py-4 mt-2 bg-[#1a1a1a] hover:bg-[#252525] text-white text-sm font-bold uppercase tracking-wider rounded-[24px] transition-all duration-300 hover:shadow-lg hover:shadow-white/5 border border-white/5"
              >
                <span>Log Out</span>
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#CCFF00] group-hover:text-black transition-colors duration-300">
                  <LogOut className="w-4 h-4" />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
