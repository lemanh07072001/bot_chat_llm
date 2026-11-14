import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import VerifyEmailForm from './verify-email-form';

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const emailParam = params.email;
  const email = typeof emailParam === 'string' ? emailParam : '';

  return (
    <div className="p-8 sm:p-10 rounded-xl bg-white border border-black/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 mx-auto rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-[#EA580C] mb-3 shadow-sm">
          <MailCheck className="w-6 h-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
          Xác nhận tài khoản
        </h1>
        <p className="text-xs text-[#86868B] mt-1 max-w-xs mx-auto">
          Nhập mã xác thực 6 chữ số vừa được gửi đến hòm thư của bạn.
        </p>
      </div>

      <VerifyEmailForm email={email} />

      <p className="mt-8 pt-5 border-t border-black/[0.06] text-center text-xs text-[#86868B]">
        <Link
          href="/login"
          className="text-[#EA580C] font-medium hover:underline"
        >
          ← Quay lại trang đăng nhập
        </Link>
      </p>
    </div>
  );
}
