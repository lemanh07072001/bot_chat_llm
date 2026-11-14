'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { KeyRound, Mail, ArrowLeft, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 1000);
  };

  return (
    <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-[#EA580C] mb-6">
        <KeyRound className="w-6 h-6" />
      </div>

      {!isSubmitted ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F] mb-2">
            Khôi phục mật khẩu
          </h1>
          <p className="text-xs sm:text-sm text-[#86868B] leading-relaxed mb-6">
            Đừng lo lắng, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu an toàn đến địa chỉ email đã đăng ký của bạn.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
                Email đăng ký tài khoản
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] placeholder-neutral-400 focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-[0.99] text-white font-medium text-xs sm:text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Gửi link khôi phục</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Anti-phishing Note */}
          <div className="mt-8 p-3.5 rounded-md bg-amber-50/80 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              <b>Lưu ý bảo mật:</b> Chat Center không bao giờ gửi email yêu cầu cung cấp mã PIN hoặc mật khẩu trực tiếp qua chat.
            </span>
          </div>
        </div>
      ) : (
        <div className="text-center py-2">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-[#1D1D1F] mb-1.5">
            Đã gửi hướng dẫn!
          </h2>
          <p className="text-xs text-[#86868B] mb-6 leading-relaxed">
            Nếu tài khoản <b className="text-[#1D1D1F]">{email}</b> tồn tại trong hệ thống, bạn sẽ nhận được một email chứa đường dẫn đặt lại mật khẩu trong ít phút.
          </p>

          <div className="space-y-3">
            <Link
              href="/reset-password"
              className="block w-full py-2.5 px-4 bg-[#F5F5F7] hover:bg-[#E8E8ED] text-xs font-medium text-[#1D1D1F] rounded-md text-center transition-all"
            >
              Chuyển tới trang Đặt lại mật khẩu →
            </Link>

            <button
              type="button"
              onClick={() => setIsSubmitted(false)}
              className="text-xs text-[#86868B] hover:text-[#1D1D1F]"
            >
              Thử lại với email khác
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 pt-5 border-t border-black/[0.06] text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-[#86868B] hover:text-[#1D1D1F]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Quay lại trang Đăng nhập</span>
        </Link>
      </div>
    </div>
  );
}
