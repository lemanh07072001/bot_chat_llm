"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  X,
} from "lucide-react";
import { isNavigationActive, navigationForRole } from "./navigation";
import { useUnreadCounts } from "./useUnreadCounts";
import { logout } from "@/app/(auth)/actions";

export interface SidebarUser {
  name?: string;
  email?: string;
  role?: string;
}

export function Sidebar({
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile,
  onOpenSearch,
}: {
  user?: SidebarUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenSearch?: () => void;
}) {
  const pathname = usePathname();
  const unreadCounts = useUnreadCounts();
  const [agentStatus, setAgentStatus] = useState<"online" | "busy" | "away">("online");

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(-2)
        .join("")
        .toUpperCase()
    : "AD";

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 md:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 bg-white border-r border-black/[0.07] flex flex-col transition-all duration-300 ease-in-out select-none shadow-[1px_0_10px_rgba(0,0,0,0.02)]
          ${collapsed ? "w-[72px]" : "w-[260px]"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-3.5 border-b border-black/[0.06] bg-white shrink-0">
          <Link
            href="/"
            className="flex items-center gap-3 overflow-hidden group py-1 rounded-lg"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#EA580C] to-[#F59E0B] flex items-center justify-center text-white shrink-0 shadow-sm shadow-orange-500/25 group-hover:scale-105 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-sm tracking-tight text-[#1D1D1F] leading-none truncate">
                  Chat Center
                </span>
                <span className="text-[10px] text-[#86868B] tracking-wider uppercase font-medium mt-1 truncate">
                  Admin Console
                </span>
              </div>
            )}
          </Link>

          {/* Desktop Toggle Button */}
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
            className="hidden md:flex w-7 h-7 rounded-lg items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
            title={collapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>

          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            aria-label="Đóng thanh điều hướng"
            className="md:hidden p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Search Trigger (When Expanded) */}
        {!collapsed && onOpenSearch && (
          <div className="px-3 pt-3">
            <button
              onClick={onOpenSearch}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-[#F5F5F7] border border-black/[0.04] text-xs text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-800 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-neutral-400" />
                <span>Tìm nhanh...</span>
              </div>
              <kbd className="px-1.5 py-0.5 rounded bg-white text-[10px] font-mono border border-black/[0.08] shadow-2xs">
                ⌘K
              </kbd>
            </button>
          </div>
        )}

        {/* Agent Work Status Switcher */}
        {!collapsed ? (
          <div className="px-3 py-2.5 mx-3 mt-3 rounded-xl bg-[#F8F9FA] border border-black/[0.04]">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-500 text-[11px] font-medium">Nhận cuộc gọi / chat</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    agentStatus === "online"
                      ? "bg-emerald-500 animate-pulse"
                      : agentStatus === "busy"
                      ? "bg-amber-500"
                      : "bg-neutral-400"
                  }`}
                />
                <span className="text-[11px] font-semibold text-neutral-800">
                  {agentStatus === "online" ? "Sẵn sàng" : agentStatus === "busy" ? "Bận" : "Tạm vắng"}
                </span>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1 bg-white p-0.5 rounded-lg border border-black/[0.05] text-[10px] font-medium text-center">
              <button
                type="button"
                onClick={() => setAgentStatus("online")}
                className={`py-1 rounded-md cursor-pointer transition-all ${
                  agentStatus === "online"
                    ? "bg-emerald-50 text-emerald-700 font-semibold shadow-2xs"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                Online
              </button>
              <button
                type="button"
                onClick={() => setAgentStatus("busy")}
                className={`py-1 rounded-md cursor-pointer transition-all ${
                  agentStatus === "busy"
                    ? "bg-amber-50 text-amber-700 font-semibold shadow-2xs"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                Bận
              </button>
              <button
                type="button"
                onClick={() => setAgentStatus("away")}
                className={`py-1 rounded-md cursor-pointer transition-all ${
                  agentStatus === "away"
                    ? "bg-neutral-100 text-neutral-800 font-semibold shadow-2xs"
                    : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                Vắng
              </button>
            </div>
          </div>
        ) : (
          /* Collapsed Status Dot */
          <div className="py-3 flex justify-center border-b border-black/[0.04]">
            <button
              onClick={() => setAgentStatus(agentStatus === "online" ? "busy" : agentStatus === "busy" ? "away" : "online")}
              title={`Trạng thái: ${agentStatus.toUpperCase()} (Nhấn để đổi)`}
              className="relative p-2 rounded-lg hover:bg-neutral-100 cursor-pointer"
            >
              <span
                className={`w-3 h-3 rounded-full block border-2 border-white shadow-xs ${
                  agentStatus === "online"
                    ? "bg-emerald-500"
                    : agentStatus === "busy"
                    ? "bg-amber-500"
                    : "bg-neutral-400"
                }`}
              />
            </button>
          </div>
        )}

        {/* Scrollable Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5 scrollbar-thin">
          {navigationForRole(user?.role).map((group, groupIdx) => (
            <div key={groupIdx}>
              {!collapsed ? (
                <div className="px-2.5 mb-1.5 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                  {group.groupTitle}
                </div>
              ) : (
                <div className="w-6 mx-auto my-2 border-b border-black/[0.06]" />
              )}

              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = isNavigationActive(item.href, pathname);
                  const unread = item.href === "/inbox" ? unreadCounts.unread : 0;
                  const badge = unread > 0 ? (unread > 99 ? "99+" : unread) : item.badge;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      onClick={onCloseMobile}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex items-center rounded-xl text-xs font-medium transition-all duration-150 ${
                        collapsed ? "justify-center p-2.5" : "px-3 py-2 gap-3"
                      } ${
                        isActive
                          ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white shadow-xs shadow-orange-500/25 font-semibold"
                          : "text-neutral-600 hover:text-neutral-900 hover:bg-black/[0.03]"
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-colors ${
                          isActive
                            ? "text-white"
                            : "text-neutral-500 group-hover:text-neutral-800"
                        }`}
                      />

                      {!collapsed && (
                        <span className="truncate flex-1 text-left">{item.label}</span>
                      )}

                      {badge !== undefined && (
                        <span
                          className={`border text-[10px] font-semibold tracking-tight transition-all ${
                            collapsed
                              ? "absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full ring-2 ring-white text-[9px] bg-rose-500 text-white border-transparent"
                              : `px-1.5 py-0.5 rounded-full ${
                                  isActive
                                    ? "bg-white/20 text-white border-transparent"
                                    : "bg-rose-500 text-white border-transparent"
                                }`
                          }`}
                        >
                          <span aria-label={`${unread} tin nhắn chưa đọc`}>{badge}</span>
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer User Profile & Action */}
        <div className="p-3 border-t border-black/[0.06] bg-[#FBFBFC] shrink-0">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-3"}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-xs font-semibold text-white shrink-0 shadow-2xs">
                {initials}
              </div>
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-neutral-900 truncate leading-none mb-1">
                    {user?.name || "Quản trị viên"}
                  </span>
                  <span className="text-[10px] text-neutral-400 truncate leading-none">
                    {user?.email || "admin@chatcenter.vn"}
                  </span>
                </div>
              )}
            </div>

            {!collapsed && (
              <form action={logout}>
                <button
                  type="submit"
                  title="Đăng xuất tài khoản"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
