import React from 'react';
import Link from 'next/link';
import { MessageCircle, Shield, Sparkles } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] flex flex-col font-sans selection:bg-[#EA580C] selection:text-white">
      {/* Top Header */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/25 group-hover:scale-105 transition-transform">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-[#1D1D1F] block leading-none">
              Chat Center
            </span>
            <span className="text-[10px] text-[#86868B] tracking-wide uppercase font-medium">
              Admin Portal
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-white border border-black/[0.06] text-[11px] font-medium text-[#1D1D1F] shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Hệ thống ổn định
          </span>
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full max-w-md mx-auto my-auto">
        <div className="w-full">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between text-xs text-[#86868B] gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-emerald-600" />
          <span>Mã hóa AES-256 đầu cuối · Tuân thủ GDPR &amp; SOC2 Type II</span>
        </div>
        <div className="flex items-center gap-4">
          <span>&copy; {new Date().getFullYear()} Chat Center Inc.</span>
          <span className="hover:text-[#1D1D1F] cursor-pointer">Chính sách bảo mật</span>
          <span className="hover:text-[#1D1D1F] cursor-pointer">Điều khoản dịch vụ</span>
        </div>
      </footer>
    </div>
  );
}
