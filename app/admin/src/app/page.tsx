import React from 'react';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  ShieldCheck,
  User,
  Activity,
  MessageSquare,
  Clock,
  CheckCircle2,
  TrendingUp,
  Headphones,
} from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Quản trị viên cấp cao',
  agent: 'Chuyên viên CSKH',
};

export default async function Home() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/logout');
  }

  return (
    <DashboardLayout user={user}>
      <main className="max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Welcome Banner Card */}
        <section className="p-6 sm:p-8 rounded-2xl bg-white border border-black/[0.06] shadow-[0_4px_30px_rgba(0,0,0,0.02)] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-amber-50/70 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#EA580C] uppercase tracking-wide px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#EA580C] animate-pulse" />
              Không gian làm việc CSKH
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1D1D1F] mb-2">
              Xin chào, {user.name} 👋
            </h1>
            <p className="text-xs sm:text-sm text-[#86868B] leading-relaxed">
              Bạn đang đăng nhập với vai trò <b className="text-[#1D1D1F]">{ROLE_LABELS[user.role] ?? user.role}</b>. Toàn bộ các kênh liên lạc khách hàng (Web Widget, Facebook, Zalo) và phân hệ trí tuệ nhân tạo đang hoạt động bình thường.
            </p>
          </div>
        </section>

        {/* Real-time KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500">Hội thoại hôm nay</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-[#EA580C] flex items-center justify-center">
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-neutral-900">128</span>
              <span className="text-[11px] font-medium text-emerald-600 flex items-center">
                <TrendingUp className="w-3 h-3 mr-0.5" /> +14%
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">So với cùng giờ hôm qua</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500">Phản hồi lần đầu (FRT)</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-neutral-900">38s</span>
              <span className="text-[11px] font-medium text-emerald-600 flex items-center">
                -12s
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">Chuẩn SLA &lt; 60s (98.4%)</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500">Độ hài lòng CSAT</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-neutral-900">98.2%</span>
              <span className="text-[11px] font-medium text-emerald-600 flex items-center">
                ★ 4.9/5
              </span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">Dựa trên 86 lượt đánh giá</span>
          </div>

          <div className="p-4 rounded-xl bg-white border border-black/[0.06] shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-neutral-500">Tư vấn viên trực tuyến</span>
              <div className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center">
                <Headphones className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-neutral-900">8 / 10</span>
              <span className="text-[11px] font-medium text-orange-600">80% ca</span>
            </div>
            <span className="text-[10px] text-neutral-400 mt-1 block">2 nhân sự đang tạm vắng</span>
          </div>
        </div>

        {/* Bento Grid Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* User Account Info Card */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1D1D1F] mb-4">
                <User className="w-4 h-4 text-[#EA580C]" />
                <span>Thông tin tài khoản</span>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-black/[0.04]">
                  <span className="text-[#86868B]">Họ tên:</span>
                  <span className="font-medium text-[#1D1D1F]">{user.name}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-black/[0.04]">
                  <span className="text-[#86868B]">Email:</span>
                  <span className="font-mono text-[#1D1D1F]">{user.email}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-[#86868B]">Quyền hạn:</span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-medium text-[11px] border border-amber-200">
                    {ROLE_LABELS[user.role] ?? user.role}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 mt-4 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#86868B]">
              <span>Mã hóa phiên: 256-bit</span>
              <span className="text-emerald-600 font-medium">Bảo vệ SSL/TLS</span>
            </div>
          </div>

          {/* Infrastructure Health Card */}
          <div className="p-6 rounded-2xl bg-white border border-black/[0.06] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1D1D1F] mb-4">
                <Activity className="w-4 h-4 text-emerald-600" />
                <span>Hạ tầng &amp; Trực tuyến</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-2">
                <div className="p-3 rounded-xl bg-[#F5F5F7] border border-black/[0.04]">
                  <span className="text-xl font-semibold text-[#1D1D1F] block">99.99%</span>
                  <span className="text-[10px] text-[#86868B]">Uptime SLA tuần</span>
                </div>
                <div className="p-3 rounded-xl bg-[#F5F5F7] border border-black/[0.04]">
                  <span className="text-xl font-semibold text-[#EA580C] block">&lt; 18ms</span>
                  <span className="text-[10px] text-[#86868B]">Độ trễ phản hồi</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-black/[0.06] text-[11px] text-[#86868B] flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Cụm máy chủ Singapore (AP-Southeast-1)</span>
            </div>
          </div>

        </div>
      </main>
    </DashboardLayout>
  );
}
