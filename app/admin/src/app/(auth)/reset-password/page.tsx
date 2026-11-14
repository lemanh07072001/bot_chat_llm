'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Lock, Eye, EyeOff, Check, X, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [logoutOtherDevices, setLogoutOtherDevices] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const rules = [
    { label: 'Tối thiểu 8 ký tự an toàn', met: password.length >= 8 },
    { label: 'Chứa ít nhất một ký tự hoa (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'Chứa ít nhất một chữ số (0-9)', met: /[0-9]/.test(password) },
    { label: 'Chứa ký tự đặc biệt (!@#$...)', met: /[^A-Za-z0-9]/.test(password) },
    { label: 'Hai mật khẩu phải trùng khớp hoàn toàn', met: password.length > 0 && password === confirmPassword },
  ];

  const allRulesMet = rules.every((r) => r.met);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesMet) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
    }, 1000);
  };

  return (
    <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-[#EA580C] mb-6">
        <ShieldCheck className="w-6 h-6" />
      </div>

      {!isSuccess ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F] mb-2">
            Thiết lập mật khẩu mới
          </h1>
          <p className="text-xs sm:text-sm text-[#86868B] leading-relaxed mb-6">
            Vui lòng tạo một mật khẩu mạnh để bảo vệ tài khoản quản trị và dữ liệu khách hàng của bạn.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
                Mật khẩu mới
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới..."
                  className="w-full pl-3.5 pr-10 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-xs font-medium text-[#1D1D1F] mb-1.5">
                Xác nhận lại mật khẩu
              </label>
              <input
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu..."
                className="w-full px-3.5 py-2.5 bg-[#F5F5F7] border border-black/[0.06] rounded-md text-xs sm:text-sm text-[#1D1D1F] focus:outline-none focus:bg-white focus:border-[#EA580C] focus:ring-4 focus:ring-orange-500/10 transition-all font-mono"
              />
            </div>

            {/* Dynamic Checklist */}
            <div className="p-4 rounded-md bg-[#F5F5F7] border border-black/[0.04] space-y-2">
              <span className="text-[11px] font-semibold text-[#86868B] block mb-1">
                Tiêu chuẩn an toàn:
              </span>
              {rules.map((rule, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 text-xs transition-colors duration-200 ${
                    rule.met ? 'text-emerald-700 font-medium' : 'text-[#86868B]'
                  }`}
                >
                  {rule.met ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                  )}
                  <span>{rule.label}</span>
                </div>
              ))}
            </div>

            {/* Hygiene Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#86868B] hover:text-[#1D1D1F] pt-1">
              <input
                type="checkbox"
                checked={logoutOtherDevices}
                onChange={(e) => setLogoutOtherDevices(e.target.checked)}
                className="w-4 h-4 rounded-sm border-neutral-300 text-[#EA580C] focus:ring-0 accent-[#EA580C]"
              />
              <span>Đăng xuất khỏi tất cả các thiết bị khác</span>
            </label>

            <button
              type="submit"
              disabled={!allRulesMet || isLoading}
              className="w-full py-3 px-4 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-medium text-xs sm:text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-40"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Lưu mật khẩu &amp; Đăng nhập</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-semibold text-[#1D1D1F] mb-1.5">
            Đổi mật khẩu thành công!
          </h2>
          <p className="text-xs text-[#86868B] mb-6 leading-relaxed">
            Mật khẩu mới đã được cập nhật an toàn. Mọi phiên đăng nhập trước đó đã được kết thúc.
          </p>
          <Link
            href="/login"
            className="block w-full py-3 px-4 rounded-md bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-xs font-medium text-center shadow-md shadow-orange-500/25"
          >
            Đăng nhập lại ngay →
          </Link>
        </div>
      )}
    </div>
  );
}
