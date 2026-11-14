'use client';

import React, { useState, useActionState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { login } from '../actions';

export default function LoginForm({ registrationOpen }: { registrationOpen: boolean }) {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  return (
    <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="mb-8">
        <span className="text-[11px] font-semibold text-[#EA580C] tracking-wide uppercase block mb-1">
          Cổng Quản Trị
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F]">
          Đăng nhập
        </h1>
        <p className="text-xs text-[#86868B] mt-1">
          Nhập email và mật mã để truy cập bảng điều khiển quản trị.
        </p>
      </div>

      {/* Backend Error Alert */}
      {state?.error && (
        <div className="mb-6 p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span>{state.error}</span>
            {state.unverifiedEmail && (
              <div className="mt-1.5">
                <Link
                  href={`/verify-email?email=${encodeURIComponent(state.unverifiedEmail)}`}
                  className="font-medium underline text-rose-900 hover:text-rose-950 inline-flex items-center gap-1"
                >
                  Kích hoạt email ngay →
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Login Form */}
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
            Email công việc
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label htmlFor="password" className="text-xs font-medium text-[#1D1D1F]">
              Mật khẩu
            </label>
            <Link
              href="/forgot-password"
              className="text-xs text-[#EA580C] hover:underline"
            >
              Quên mật mã?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="••••••••••••"
              className="w-full pl-10 pr-10 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#86868B] hover:text-[#1D1D1F]">
            <input
              type="checkbox"
              name="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded-sm border-neutral-300 text-[#EA580C] focus:ring-0 accent-[#EA580C]"
            />
            <span>Ghi nhớ đăng nhập</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full py-3 px-4 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-[0.99] text-white font-medium text-xs sm:text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {pending ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Đăng nhập vào Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Social Authentication */}
      <div className="relative my-6 text-center">
        <div className="border-t border-black/[0.06] w-full" />
        <span className="bg-white px-3 text-[11px] text-[#86868B] relative -top-2">
          hoặc đăng nhập bằng
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => alert('Đang kết nối tới Google Workspace SSO...')}
          className="py-2.5 px-3 rounded-md border border-black/[0.08] hover:bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Google</span>
        </button>
        <button
          type="button"
          onClick={() => alert('Đang kết nối tới GitHub OAuth...')}
          className="py-2.5 px-3 rounded-md border border-black/[0.08] hover:bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F] transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
        >
          <svg className="w-4 h-4 fill-[#1D1D1F]" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          <span>GitHub</span>
        </button>
      </div>

      {/* Bottom Register Prompt — only while the workspace still has no admin;
          afterwards self-registration is closed and the link would dead-end. */}
      <div className="mt-8 pt-6 border-t border-black/[0.06] text-center text-xs text-[#86868B]">
        {registrationOpen ? (
          <>
            Chưa có tài khoản quản trị?{' '}
            <Link
              href="/register"
              className="text-[#EA580C] font-medium hover:underline"
            >
              Khởi tạo ngay
            </Link>
          </>
        ) : (
          <>Chưa có tài khoản? Hãy đề nghị quản trị viên cấp cho bạn.</>
        )}
      </div>
    </div>
  );
}
