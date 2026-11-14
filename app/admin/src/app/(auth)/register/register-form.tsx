'use client';

import React, { useState, useActionState } from 'react';
import { Eye, EyeOff, Lock, Mail, User, ArrowRight, AlertCircle } from 'lucide-react';
import { register } from '../actions';

export default function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <>
      {/* Backend Error Alert */}
      {state?.error && (
        <div className="mb-6 p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
            Họ và tên
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="name"
              name="name"
              type="text"
              required
              autoComplete="name"
              placeholder="Nguyễn Văn A"
              className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all"
            />
          </div>
        </div>

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
          <label htmlFor="password" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
            Mật khẩu (8 - 72 ký tự)
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
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

        <button
          type="submit"
          disabled={pending}
          className="w-full mt-2 py-3 px-4 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-[0.99] text-white font-medium text-xs sm:text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          {pending ? (
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <span>Tạo tài khoản quản trị</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </>
  );
}
