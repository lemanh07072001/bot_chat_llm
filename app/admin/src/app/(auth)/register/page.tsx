import React from 'react';
import Link from 'next/link';
import { Lock, ShieldCheck } from 'lucide-react';
import { isRegistrationOpen } from '@/lib/session';
import RegisterForm from './register-form';

export default async function RegisterPage() {
  // Self-registration only serves the very first account; after that the API
  // refuses it, so the form is not even offered.
  if (!(await isRegistrationOpen())) {
    return (
      <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
          <Lock className="w-6 h-6" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F]">
          Đăng ký đã đóng
        </h1>
        <p className="text-xs text-[#86868B] mt-2 leading-relaxed">
          Hệ thống đã có quản trị viên, nên tài khoản nhân viên không còn tự đăng ký được nữa —
          đây là chủ ý, vì một tài khoản nhân viên đọc được toàn bộ hội thoại của khách.
        </p>
        <p className="text-xs text-[#86868B] mt-3 leading-relaxed">
          Để được cấp tài khoản, hãy đề nghị quản trị viên tạo cho bạn trong{' '}
          <b className="text-[#1D1D1F] font-medium">Quản trị &amp; Phân tích → Quản lý người dùng</b>.
          Tài khoản tạo theo cách đó được kích hoạt email ngay.
        </p>

        <p className="mt-6 pt-5 border-t border-black/[0.06] text-[11px] text-[#86868B] leading-relaxed">
          Nếu đây là lần cài đặt đầu tiên và bạn đang thấy thông báo này, nghĩa là admin panel chưa
          gọi được API. Kiểm tra API có đang chạy và biến <code className="font-mono">API_URL</code>{' '}
          đã trỏ đúng chưa.
        </p>

        <p className="mt-5 text-center text-xs text-[#86868B]">
          <Link href="/login" className="text-[#EA580C] font-medium hover:underline">
            ← Quay lại trang đăng nhập
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="mb-8">
        <span className="text-[11px] font-semibold text-[#EA580C] tracking-wide uppercase block mb-1">
          Khởi tạo hệ thống
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F]">
          Tạo quản trị viên đầu tiên
        </h1>
        <p className="text-xs text-[#86868B] mt-1 leading-relaxed">
          Hệ thống chưa có tài khoản nào. Tài khoản bạn tạo ở đây sẽ là quản trị viên cấp cao, và
          sau đó đăng ký công khai tự động đóng lại.
        </p>
      </div>

      <div className="mb-6 p-3 rounded-md bg-amber-50/60 border border-amber-200 text-[11px] text-[#1D1D1F] flex items-start gap-2.5 leading-relaxed">
        <ShieldCheck className="w-4 h-4 text-[#EA580C] shrink-0 mt-px" />
        <span>
          Nhân viên về sau được cấp tài khoản bởi quản trị viên, không tự đăng ký. Hãy dùng email
          thật để nhận được mã xác thực và khôi phục mật khẩu.
        </span>
      </div>

      <RegisterForm />

      {/* Bottom Login Prompt */}
      <div className="mt-8 pt-6 border-t border-black/[0.06] text-center text-xs text-[#86868B]">
        Đã có tài khoản?{' '}
        <Link href="/login" className="text-[#EA580C] font-medium hover:underline">
          Đăng nhập ngay
        </Link>
      </div>
    </div>
  );
}
