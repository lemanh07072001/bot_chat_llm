"use client";

import React, { useState, useTransition, useEffect, useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Headphones,
  Search,
  X,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Pencil,
  Filter,
  Copy,
  CheckCheck,
  RefreshCw,
  Sparkles,
  Key,
  AlertCircle,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { ImageUploadField, RemoteImage, useImageUpload } from "@/components/ui";
import { deleteUser, saveUser } from "./actions";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent";
  /** Shown to visitors in the chat box, next to the name. */
  jobTitle?: string | null;
  avatarUrl?: string | null;
  emailVerified: boolean;
  createdAt: string;
};

interface UsersClientProps {
  users: ManagedUser[];
  currentUserId: string;
}

const AVATAR_GRADIENTS = [
  "from-amber-600 to-orange-600",
  "from-emerald-600 to-teal-700",
  "from-violet-600 to-purple-700",
  "from-amber-500 to-orange-600",
  "from-orange-500 to-amber-600",
  "from-rose-500 to-pink-600",
];

function getAvatarGradient(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (!parts.length || !parts[0]) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(dateString: string) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Ho_Chi_Minh",
    });
  } catch {
    return dateString;
  }
}

function generateSecurePassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const specials = "!@#$%^&*";
  let pass = "";
  for (let i = 0; i < 6; i++) pass += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) pass += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = 0; i < 2; i++) pass += specials[Math.floor(Math.random() * specials.length)];
  return pass
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

/** Modal dialog for creating a new user or editing an existing user */
function UserModal({
  user,
  self,
  onClose,
  onSuccess,
}: {
  user?: ManagedUser;
  self: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveUser, {});
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [selectedRole, setSelectedRole] = useState<"admin" | "agent">(user?.role ?? "agent");
  const avatar = useImageUpload(user?.avatarUrl ?? undefined);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Handle successful submission
  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => {
        onSuccess();
        onClose();
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [state.success, onSuccess, onClose]);

  const handleGeneratePassword = () => {
    const gen = generateSecurePassword();
    setPasswordValue(gen);
    setShowPassword(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between bg-neutral-50/60">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                user ? "bg-amber-50 text-[#EA580C]" : "bg-amber-50 text-[#EA580C]"
              }`}
            >
              {user ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-semibold text-[#1D1D1F]">
                {user ? "Chỉnh sửa người dùng" : "Thêm người dùng mới"}
              </h2>
              <p className="text-xs text-[#86868B]">
                {user ? `Cập nhật thông tin tài khoản ${user.email}` : "Cấp tài khoản đăng nhập vào hệ thống quản trị"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form */}
        <form action={formAction} className="p-5 overflow-y-auto space-y-4">
          {user && <input type="hidden" name="id" value={user.id} />}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
              Họ và tên <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                name="name"
                defaultValue={user?.name}
                required
                maxLength={100}
                placeholder="Ví dụ: Nguyễn Văn An"
                autoComplete="name"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
              />
            </div>
          </div>

          {/* What the visitor sees: the face and the role under the name. */}
          <div>
            <label className="block text-xs font-medium text-[#1D1D1F] mb-1.5">Chức vụ</label>
            <input
              name="jobTitle"
              defaultValue={user?.jobTitle ?? ""}
              maxLength={60}
              placeholder="Ví dụ: Tư vấn viên"
              className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
            />
            <p className="mt-1 text-[11px] text-[#86868B]">
              Khách nhìn thấy dòng này trong hộp chat, dưới tên người trả lời. Để trống thì chỉ hiện
              tên.
            </p>
          </div>

          <ImageUploadField
            state={avatar}
            name="avatarUrl"
            label="Ảnh đại diện"
            hint="Hiện trong hộp chat bên website của khách. PNG, JPEG hoặc WebP, tối đa 5 MB — ảnh được thu nhỏ trước khi tải lên. Để trống thì khách thấy chữ viết tắt của tên."
            round
            fallback={
              <span className="text-[11px] font-semibold text-neutral-500">
                {getInitials(user?.name ?? "")}
              </span>
            }
            urlPlaceholder="Hoặc dán URL ảnh: https://example.com/avatar.png"
          />

          {/* Email Address */}
          <div>
            <label className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
              Địa chỉ Email <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                name="email"
                type="email"
                defaultValue={user?.email}
                required
                disabled={!!user}
                placeholder="admin@chatcenter.vn"
                autoComplete="email"
                className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition ${
                  user
                    ? "bg-neutral-100/70 border-neutral-200 text-neutral-500 cursor-not-allowed"
                    : "bg-white border-neutral-200 text-[#1D1D1F] placeholder:text-neutral-400 focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
                }`}
              />
              {user && (
                <span className="absolute right-3 top-2.5 text-[11px] text-neutral-400">
                  Không thể thay đổi email
                </span>
              )}
            </div>
          </div>

          {/* Password (Only for new user) */}
          {!user && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-[#1D1D1F]">
                  Mật khẩu khởi tạo <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGeneratePassword}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-[#EA580C] hover:underline"
                >
                  <Sparkles className="w-3 h-3" /> Tạo ngẫu nhiên
                </button>
              </div>
              <div className="relative">
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                  placeholder="Tối thiểu 8 ký tự..."
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 pr-10 text-sm text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600 transition"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-[#86868B]">
                Tài khoản tạo bởi Quản trị viên sẽ được tự động kích hoạt email ngay lập tức.
              </p>
            </div>
          )}

          {/* Role Selection Cards */}
          <div>
            <label className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
              Vai trò &amp; Phân quyền <span className="text-red-500">*</span>
            </label>
            <input type="hidden" name="role" value={selectedRole} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: Admin */}
              <button
                type="button"
                onClick={() => {
                  if (!self || user?.role === "admin") setSelectedRole("admin");
                }}
                disabled={self && user?.role !== "admin"}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === "admin"
                    ? "border-[#EA580C] bg-amber-50/40 ring-1 ring-[#EA580C]"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                } ${self && user?.role !== "admin" ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-[#EA580C]" />
                    <span className="text-xs font-semibold text-[#1D1D1F]">Quản trị viên</span>
                  </div>
                  {selectedRole === "admin" && (
                    <div className="w-4 h-4 rounded-full bg-[#EA580C] text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#86868B] leading-tight">
                  Toàn quyền quản trị nhân sự, cấu hình hệ thống &amp; giám sát.
                </p>
              </button>

              {/* Option 2: Agent */}
              <button
                type="button"
                onClick={() => {
                  if (!self) setSelectedRole("agent");
                }}
                disabled={self}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  selectedRole === "agent"
                    ? "border-[#EA580C] bg-amber-50/40 ring-1 ring-[#EA580C]"
                    : "border-neutral-200 bg-white hover:border-neutral-300"
                } ${self ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-semibold text-[#1D1D1F]">Chuyên viên CSKH</span>
                  </div>
                  {selectedRole === "agent" && (
                    <div className="w-4 h-4 rounded-full bg-[#EA580C] text-white flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#86868B] leading-tight">
                  Tiếp nhận và phản hồi hội thoại khách hàng qua các kênh.
                </p>
              </button>
            </div>

            {self && (
              <p className="mt-1.5 text-[11px] text-amber-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Bạn đang đăng nhập bằng tài khoản này, không thể tự hạ quyền quản trị.
              </p>
            )}
          </div>

          {/* Feedback messages */}
          {state.error && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 border border-red-200/80 text-xs text-red-700 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{state.error}</span>
            </div>
          )}

          {state.success && (
            <div
              role="status"
              className="p-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs text-emerald-700 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{state.success}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-medium transition shadow-xs disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {pending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{pending ? "Đang xử lý..." : user ? "Lưu thay đổi" : "Tạo tài khoản"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersClient({ users, currentUserId }: UsersClientProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "agent" | "unverified">("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "name">("newest");
  const [modalState, setModalState] = useState<{ mode: "create" | "edit"; user?: ManagedUser } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [deleteState, setDeleteState] = useState<{ error?: string; success?: string }>({});
  const [isDeleting, startDelete] = useTransition();

  const handleDelete = () => {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        const result = await deleteUser(deleteTarget.id);
        setDeleteState(result);
        if (result.success) {
          setDeleteTarget(null);
          router.refresh();
        }
      } catch {
        setDeleteState({ error: "Không thể xóa người dùng. Vui lòng thử lại." });
      }
    });
  };

  // Handle manual refresh
  const handleRefresh = () => {
    startRefresh(() => {
      router.refresh();
    });
  };

  // Copy email helper
  const handleCopyEmail = (email: string, id: string) => {
    navigator.clipboard.writeText(email);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // KPI calculations
  const totalCount = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const agentCount = users.filter((u) => u.role === "agent").length;
  const verifiedCount = users.filter((u) => u.emailVerified).length;
  const unverifiedCount = totalCount - verifiedCount;

  // Filter & search logic
  const filteredUsers = users
    .filter((u) => {
      // Role filter
      if (roleFilter === "admin" && u.role !== "admin") return false;
      if (roleFilter === "agent" && u.role !== "agent") return false;
      if (roleFilter === "unverified" && u.emailVerified) return false;

      // Query search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sortOrder === "name") {
        return a.name.localeCompare(b.name, "vi");
      }
      if (sortOrder === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div className="w-full space-y-3">
      {/* 1. Header Bar with Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-black/[0.06] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold tracking-tight text-[#1D1D1F]">
              Quản lý người dùng
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-[#EA580C] border border-amber-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] animate-pulse" />
              {totalCount} thành viên
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#86868B]">
            Phân quyền quản trị viên cấp cao và chuyên viên trực chat chăm sóc khách hàng.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <button
            onClick={handleRefresh}
            title="Tải lại danh sách"
            className="p-2 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 transition"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#EA580C]" : ""}`} />
          </button>
          <button
            onClick={() => setModalState({ mode: "create" })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-semibold shadow-xs transition active:scale-98"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* 2. Compact KPI Stat Strip */}
      {deleteState.success && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{deleteState.success}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-2.5">
        {/* KPI 1 */}
        <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-neutral-500 block">Tổng tài khoản</span>
            <span className="text-xl font-bold tracking-tight text-[#1D1D1F]">{totalCount}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#EA580C] flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-neutral-500 block">Quản trị viên</span>
            <span className="text-xl font-bold tracking-tight text-[#1D1D1F]">{adminCount}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-neutral-500 block">Chuyên viên CSKH</span>
            <span className="text-xl font-bold tracking-tight text-[#1D1D1F]">{agentCount}</span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Headphones className="w-4 h-4" />
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-3 rounded-xl bg-white border border-black/[0.06] shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-medium text-neutral-500 block">Đã xác thực</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold tracking-tight text-emerald-600">{verifiedCount}</span>
              <span className="text-[10px] text-neutral-400">/{totalCount}</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Search & Segmented Filter Toolbar */}
      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-black/[0.06] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc email người dùng..."
            className="w-full pl-9 pr-8 py-1.5 rounded-lg border border-neutral-200 text-xs text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-1 focus:ring-[#EA580C]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters & Sorting */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Segmented Filter Pills */}
          <div className="inline-flex rounded-lg bg-neutral-100 p-0.5 text-xs text-neutral-600">
            <button
              onClick={() => setRoleFilter("all")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                roleFilter === "all" ? "bg-white text-[#1D1D1F] shadow-2xs" : "hover:text-neutral-900"
              }`}
            >
              Tất cả ({totalCount})
            </button>
            <button
              onClick={() => setRoleFilter("admin")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1 ${
                roleFilter === "admin" ? "bg-white text-[#EA580C] shadow-2xs" : "hover:text-neutral-900"
              }`}
            >
              <Shield className="w-3 h-3" />
              Admin ({adminCount})
            </button>
            <button
              onClick={() => setRoleFilter("agent")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1 ${
                roleFilter === "agent" ? "bg-white text-emerald-600 shadow-2xs" : "hover:text-neutral-900"
              }`}
            >
              <Headphones className="w-3 h-3" />
              CSKH ({agentCount})
            </button>
            {unverifiedCount > 0 && (
              <button
                onClick={() => setRoleFilter("unverified")}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition flex items-center gap-1 ${
                  roleFilter === "unverified" ? "bg-white text-amber-600 shadow-2xs" : "hover:text-neutral-900"
                }`}
              >
                <Clock className="w-3 h-3" />
                Chờ duyệt ({unverifiedCount})
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest" | "name")}
              aria-label="Sắp xếp danh sách"
              className="appearance-none rounded-lg border border-neutral-200 bg-white pl-2.5 pr-7 py-1 text-[11px] text-neutral-600 outline-none focus:border-[#EA580C] cursor-pointer"
            >
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
              <option value="name">Tên A-Z</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-neutral-400 absolute right-2 top-2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 4. Full-width User Table */}
      <div className="bg-white rounded-xl border border-black/[0.06] shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-neutral-200/80 bg-neutral-50/80 text-neutral-500 font-medium">
                <th scope="col" className="px-3.5 py-3">Thành viên</th>
                <th scope="col" className="px-3.5 py-3">Vai trò</th>
                <th scope="col" className="px-3.5 py-3">Trạng thái</th>
                <th scope="col" className="px-3.5 py-3 whitespace-nowrap">Ngày khởi tạo</th>
                <th scope="col" className="px-3.5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUserId;
                  const initials = getInitials(user.name);
                  const gradient = getAvatarGradient(user.name);

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-amber-50/40 transition-colors group"
                    >
                      {/* Member Info */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg overflow-hidden bg-gradient-to-br ${gradient} text-white flex items-center justify-center font-bold text-xs shadow-2xs shrink-0`}
                          >
                            {/* The real avatar when there is one, so this list
                                shows what the visitor will see. */}
                            <RemoteImage
                              key={user.avatarUrl ?? ""}
                              src={user.avatarUrl ?? undefined}
                              name={user.name}
                              fallback={<span>{initials}</span>}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-[#1D1D1F] text-xs">
                                {user.name}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-amber-50 text-[#EA580C] border border-amber-200/60">
                                  Bạn
                                </span>
                              )}
                              {user.jobTitle && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 text-neutral-500 border border-neutral-200">
                                  {user.jobTitle}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-neutral-400 mt-0.5">
                              <span className="truncate max-w-[200px] sm:max-w-[300px]">
                                {user.email}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyEmail(user.email, user.id)}
                                title="Sao chép email"
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700"
                              >
                                {copiedId === user.id ? (
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {user.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-[#EA580C] border border-amber-200">
                            <Shield className="w-3 h-3 text-[#EA580C]" />
                            Quản trị viên
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Headphones className="w-3 h-3 text-emerald-600" />
                            Chuyên viên CSKH
                          </span>
                        )}
                      </td>

                      {/* Verification Status */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap">
                        {user.emailVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Đã kích hoạt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Chờ kích hoạt
                          </span>
                        )}
                      </td>

                      {/* Created At */}
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-neutral-500 text-[11px]">
                        {formatDate(user.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => setModalState({ mode: "edit", user })}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 text-[11px] font-medium transition shadow-2xs hover:border-[#EA580C] hover:text-[#EA580C]"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Sửa</span>
                        </button>
                        <button
                          type="button"
                          disabled={isCurrent}
                          title={isCurrent ? "Không thể tự xóa tài khoản đang đăng nhập" : "Xóa người dùng"}
                          onClick={() => { setDeleteState({}); setDeleteTarget(user); }}
                          className="ml-2 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" /> Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-full bg-neutral-100 text-neutral-400 flex items-center justify-center mx-auto mb-3">
                      <Search className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-[#1D1D1F]">
                      Không tìm thấy người dùng phù hợp
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      {searchQuery
                        ? `Không có kết quả nào cho "${searchQuery}". Hãy thử từ khóa khác.`
                        : "Chưa có tài khoản nào trong bộ lọc này."}
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setRoleFilter("all");
                        }}
                        className="mt-3 px-3 py-1.5 text-xs text-[#EA580C] font-medium hover:underline"
                      >
                        Đặt lại tìm kiếm
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer Bar */}
        <div className="px-3.5 py-2.5 bg-neutral-50/60 border-t border-neutral-100 flex flex-col sm:flex-row items-center justify-between text-[11px] text-neutral-500 gap-1.5">
          <span>
            Hiển thị <strong className="text-[#1D1D1F]">{filteredUsers.length}</strong> / {totalCount} người dùng
          </span>
          <span className="text-neutral-400 text-[10px]">
            Hệ thống bảo vệ mật khẩu &amp; mã hóa SHA256/Bcrypt
          </span>
        </div>
      </div>

      {/* 5. Modal Dialog for Create / Edit */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-user-title" aria-describedby="delete-user-description" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <h2 id="delete-user-title" className="text-base font-semibold text-[#1D1D1F]">Xóa người dùng?</h2>
            <p id="delete-user-description" className="text-sm text-neutral-600">
              Bạn có chắc muốn xóa <strong>{deleteTarget.name}</strong> ({deleteTarget.email})? Tài khoản sẽ không thể đăng nhập. Lịch sử hội thoại vẫn được giữ lại. Người đang sở hữu dự án cần chuyển quyền sở hữu trước khi xóa.
            </p>
            {deleteState.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{deleteState.error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" autoFocus disabled={isDeleting} onClick={() => setDeleteTarget(null)} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm disabled:opacity-50">Hủy</button>
              <button type="button" disabled={isDeleting} onClick={handleDelete} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50">
                {isDeleting && <RefreshCw className="h-4 w-4 animate-spin" />}
                {isDeleting ? "Đang xóa..." : "Xác nhận xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
      {modalState && (
        <UserModal
          user={modalState.mode === "edit" ? modalState.user : undefined}
          self={modalState.mode === "edit" && modalState.user?.id === currentUserId}
          onClose={() => setModalState(null)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
