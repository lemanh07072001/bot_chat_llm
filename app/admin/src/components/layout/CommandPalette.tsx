"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowRight,
  X,
} from "lucide-react";

import { navigationForRole } from "./navigation";

export function CommandPalette({
  isOpen,
  onClose,
  role,
}: {
  isOpen: boolean;
  onClose: () => void;
  role?: string;
}) {
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const commands = navigationForRole(role).flatMap((group) => group.items.map((item) => ({ ...item, id: item.href, title: item.label, category: group.groupTitle })));
  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (href?: string) => {
    onClose();
    if (href) {
      router.push(href);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col transform transition-all animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-black/[0.06] gap-3 bg-neutral-50/50">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm kiếm tính năng, khách hàng, kênh kết nối... (nhấn Esc để đóng)"
            className="w-full bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-black/[0.02]">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-neutral-400">
              Không tìm thấy lệnh hoặc trang phù hợp với &quot;{query}&quot;
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item.href)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs text-neutral-700 hover:bg-amber-500/10 hover:text-[#EA580C] transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-600 group-hover:bg-[#EA580C] group-hover:text-white transition-colors">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-medium block text-neutral-900 group-hover:text-[#EA580C]">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-neutral-400 group-hover:text-amber-800/80">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-[#EA580C] border border-amber-200/60">
                        {item.badge}
                      </span>
                    )}
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 border-t border-black/[0.06] bg-neutral-50 flex items-center justify-between text-[11px] text-neutral-400">
          <div className="flex items-center gap-2">
            <span>Dùng phím <kbd className="px-1.5 py-0.5 bg-white border border-black/[0.1] rounded text-[10px] font-mono shadow-xs">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white border border-black/[0.1] rounded text-[10px] font-mono shadow-xs">↓</kbd> để duyệt</span>
          </div>
          <span>Nhấn <kbd className="px-1.5 py-0.5 bg-white border border-black/[0.1] rounded text-[10px] font-mono shadow-xs">Esc</kbd> để thoát</span>
        </div>
      </div>
    </div>
  );
}
