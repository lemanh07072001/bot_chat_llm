'use client';

import React, { useActionState } from 'react';
import { Mail, KeyRound, ArrowRight, AlertCircle, RefreshCw } from 'lucide-react';
import { resendVerifyEmail, verifyEmail } from '../actions';

export default function VerifyEmailForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(verifyEmail, undefined);
  const [resendState, resendAction, resendPending] = useActionState(
    resendVerifyEmail,
    undefined
  );

  return (
    <div className="space-y-4">
      {state?.error && (
        <div className="p-3.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
            Email xác thực
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={email}
              autoComplete="email"
              className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all font-mono"
            />
          </div>
        </div>

        <div>
          <label htmlFor="otp" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
            Mã OTP 6 chữ số
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="otp"
              name="otp"
              type="text"
              required
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              autoComplete="one-time-code"
              className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-sm sm:text-base font-mono tracking-widest text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all text-center"
            />
          </div>
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
              <span>Xác nhận &amp; Đăng nhập</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <form action={resendAction} className="pt-2 text-center">
        <input type="hidden" name="email" defaultValue={email} />
        <button
          type="submit"
          disabled={resendPending}
          className="inline-flex items-center gap-1.5 text-xs text-[#EA580C] hover:underline disabled:opacity-50 font-medium cursor-pointer"
        >
          {resendPending && <RefreshCw className="w-3 h-3 animate-spin" />}
          <span>{resendPending ? 'Đang gửi mã...' : 'Chưa nhận được? Gửi lại mã'}</span>
        </button>
        {resendState?.message && (
          <p className="text-xs text-emerald-600 mt-2 font-medium" aria-live="polite">
            {resendState.message}
          </p>
        )}
      </form>
    </div>
  );
}
