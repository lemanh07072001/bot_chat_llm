"use client";

import React, { useEffect, useState } from "react";
import {
  Menu,
  Search,
  Bell,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { SidebarUser } from "./Sidebar";
import { AccountDialog } from "./AccountDialog";
import { OPEN_ACCOUNT_PREFERENCES_EVENT } from "@/components/inbox/CannedPicker";

interface HeaderProps {
  user?: SidebarUser;
  onOpenMobile: () => void;
  onOpenSearch: () => void;
}

export function Header({ user, onOpenMobile, onOpenSearch }: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
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
          <span className="font-semibold text-sm text-[#1D1D1F]">
            Bàn làm việc
          </span>
          <span className="hidden sm:inline text-neutral-300">/</span>
          <span className="hidden sm:inline text-[#86868B]">
            Tổng quan hệ thống
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
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-lg text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Thông báo hệ thống"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-600 ring-2 ring-white" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-black/[0.08] p-4 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-2 border-b border-black/[0.06] mb-3">
                <span className="font-semibold text-neutral-900">Thông báo mới</span>
                <span className="text-[10px] text-[#EA580C] font-semibold cursor-pointer hover:underline">Đánh dấu đã đọc</span>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2.5 items-start">
                  <span className="w-2 h-2 mt-1 rounded-full bg-orange-500 shrink-0" />
                  <div>
                    <p className="text-neutral-800 font-medium text-[11px]">Khách hàng mới cần tư vấn</p>
                    <p className="text-neutral-400 text-[10px]">Trần Văn Hưng vừa gửi tin nhắn qua Web Widget</p>
                    <span className="text-[9px] text-neutral-400 mt-0.5 block">2 phút trước</span>
                  </div>
                </div>
                <div className="flex gap-2.5 items-start">
                  <span className="w-2 h-2 mt-1 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <p className="text-neutral-800 font-medium text-[11px]">Cập nhật bot flow thành công</p>
                    <p className="text-neutral-400 text-[10px]">Kịch bản đón tiếp khách VIP đã được kích hoạt</p>
                    <span className="text-[9px] text-neutral-400 mt-0.5 block">1 giờ trước</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

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

          <form action={logout}>
            <button
              type="submit"
              title="Đăng xuất khỏi hệ thống"
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-black/[0.08] hover:bg-neutral-50 text-xs font-medium text-[#86868B] hover:text-rose-600 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Thoát</span>
            </button>
          </form>
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
