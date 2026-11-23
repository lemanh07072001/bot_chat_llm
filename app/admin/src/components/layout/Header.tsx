"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Menu,
  Search,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { SidebarUser } from "./Sidebar";
import { AccountDialog } from "./AccountDialog";
import { LogoutButton } from "./LogoutButton";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { OPEN_ACCOUNT_PREFERENCES_EVENT } from "@/components/inbox/CannedPicker";

interface HeaderProps {
  user?: SidebarUser;
  onOpenMobile: () => void;
  onOpenSearch: () => void;
}

/** Breadcrumb title (and its tooltip) for each top-level page. */
const PAGE_TITLES: { href: string; title: string; description: string }[] = [
  { href: "/inbox", title: "Hộp thư đến", description: "Hội thoại trực tiếp với khách hàng" },
  {
    href: "/tickets",
    title: "Ticket",
    description: "Yêu cầu khách để lại khi không có nhân viên trực",
  },
  { href: "/channels/widget", title: "Live Chat Widget", description: "Cấu hình khung chat trên website" },
  { href: "/users", title: "Quản lý người dùng", description: "Tài khoản và phân quyền nhân viên" },
];

const DEFAULT_PAGE_TITLE = { title: "Tổng quan hệ thống", description: "Tổng quan hệ thống" };

function pageTitleFor(pathname: string) {
  return (
    PAGE_TITLES.find(
      (page) => pathname === page.href || pathname.startsWith(`${page.href}/`),
    ) ?? DEFAULT_PAGE_TITLE
  );
}

export function Header({ user, onOpenMobile, onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const page = pageTitleFor(pathname ?? "/");
  const [showAccount, setShowAccount] = useState(false);
  const [accountTab, setAccountTab] = useState("profile");

  // The inbox composer cannot reach this dialog, so it asks for it by event.
  useEffect(() => {
    const listener = () => {
      setAccountTab("preferences");
      setShowAccount(true);
    };
    window.addEventListener(OPEN_ACCOUNT_PREFERENCES_EVENT, listener);
    return () => window.removeEventListener(OPEN_ACCOUNT_PREFERENCES_EVENT, listener);
  }, []);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(-2)
        .join("")
        .toUpperCase()
    : "AD";

  return (
    <header className="h-16 shrink-0 bg-white/80 backdrop-blur-md border-b border-black/[0.06] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      {/* Left: Mobile trigger & Breadcrumbs */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobile}
          aria-label="Mở thanh điều hướng"
          className="md:hidden p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-xs">
          {/* Mobile has room for one crumb: the page's own title when it has one. */}
          <span className="sm:hidden font-semibold text-sm text-[#1D1D1F]" title={page.description}>
            {page === DEFAULT_PAGE_TITLE ? "Bàn làm việc" : page.title}
          </span>
          <span className="hidden sm:inline font-semibold text-sm text-[#1D1D1F]">
            Bàn làm việc
          </span>
          <span className="hidden sm:inline text-neutral-300">/</span>
          <span className="hidden sm:inline text-[#86868B]" title={page.description}>
            {page.title}
          </span>
        </div>
      </div>

      {/* Right: Search, Status, Notifications, User */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Quick Search Button */}
        <button
          onClick={onOpenSearch}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F5F5F7] hover:bg-neutral-200/60 border border-black/[0.04] text-xs text-neutral-500 hover:text-neutral-800 transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-neutral-400" />
          <span>Tìm nhanh...</span>
          <kbd className="ml-2 px-1.5 py-0.5 rounded bg-white text-[10px] font-mono text-neutral-500 border border-black/[0.08] shadow-2xs">
            Ctrl+K
          </kbd>
        </button>

        {/* Server Health Status */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50/80 border border-emerald-100 text-[11px] text-emerald-800 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Hệ thống trực tuyến</span>
        </div>

        {/* Notifications Popover */}
        <NotificationBell />

        {/* User Pill & Logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-black/[0.08]">
          <button type="button" title="Tài khoản & tùy chọn" onClick={() => setShowAccount(true)} className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-xs font-semibold text-white shadow-2xs">
              {initials}
            </div>
            <div className="hidden md:block text-left">
              <span className="text-xs font-medium text-[#1D1D1F] block leading-none">
                {user?.name || "Quản trị viên"}
              </span>
              <span className="text-[10px] text-[#86868B] capitalize">
                {user?.role || "Admin"}
              </span>
            </div>
          </button>

          <LogoutButton
            action={logout}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-black/[0.08] hover:bg-neutral-50 text-xs font-medium text-[#86868B] hover:text-rose-600 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Thoát</span>
          </LogoutButton>
        </div>
      </div>
      {showAccount && (
        <AccountDialog
          initialTab={accountTab}
          onClose={() => {
            setShowAccount(false);
            setAccountTab("profile");
          }}
        />
      )}
    </header>
  );
}
