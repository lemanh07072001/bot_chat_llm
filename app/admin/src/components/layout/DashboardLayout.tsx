"use client";

import React, { useState, useEffect } from "react";
import { Sidebar, SidebarUser } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";


interface DashboardLayoutProps {
  children: React.ReactNode;
  user?: SidebarUser;
  fullHeight?: boolean;
}

export function DashboardLayout({ children, user, fullHeight = false }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Global keyboard shortcut for Command Palette (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`${fullHeight ? "h-dvh overflow-hidden" : "min-h-screen"} bg-[#F5F5F7] text-[#1D1D1F] flex flex-col font-sans selection:bg-[#EA580C] selection:text-white`}>
      {/* Interactive Collapsible Sidebar */}
      <Sidebar
        user={user}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onOpenSearch={() => setSearchOpen(true)}
      />

      {/* Main Layout Area - Dynamically adjusts padding based on sidebar state */}
      <div
        className={`flex-1 min-h-0 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${
          collapsed ? "md:pl-[72px]" : "md:pl-[260px]"
        }`}
      >
        {/* Sticky Top Header */}
        <Header
          user={user}
          onOpenMobile={() => setMobileOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />

        {/* Dynamic Page Content Slot */}
        <div className={`flex-1 min-h-0 flex flex-col ${fullHeight ? "overflow-hidden" : ""}`}>
          {children}
        </div>


      </div>

      {/* Global Command Palette Dialog (Ctrl+K) */}
      <CommandPalette
        role={user?.role}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
}
