import React from 'react';
import { MessageCircle, ShieldCheck } from 'lucide-react';

export function AuthShowcase() {
  return (
    <section
      aria-label="Product Showcase"
      className="hidden lg:flex lg:col-span-7 flex-col justify-between p-10 xl:p-12 rounded-xl bg-white border border-black/[0.06] shadow-[0_4px_30px_rgba(0,0,0,0.03)] relative overflow-hidden"
    >
      {/* Subtle Ambient Refraction */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-50/80 via-transparent to-transparent pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-500/25">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-tight text-[#1D1D1F] block">
              Chat Center
            </span>
            <span className="text-xs text-[#86868B]">Intelligent Support Architecture</span>
          </div>
        </div>

        <span className="px-2 py-0.5 rounded bg-[#F5F5F7] text-[#1D1D1F] text-xs font-medium border border-black/[0.04]">
          Phiên bản 2026
        </span>
      </div>

      {/* Central Bento Grid Showcase */}
      <div className="relative z-10 my-10 space-y-6">
        <div className="max-w-xl">
          <h1 className="text-3xl xl:text-4xl font-semibold tracking-tight text-[#1D1D1F] leading-tight mb-4">
            Hội thoại thông minh. Thiết kế cho những đội ngũ dẫn đầu.
          </h1>
          <p className="text-sm text-[#86868B] leading-relaxed">
            Tất cả các kênh liên lạc khách hàng gom về một giao diện thuần khiết, xử lý mượt mà và bảo mật tối đa chuẩn doanh nghiệp.
          </p>
        </div>

        {/* Bento Metric Cards */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="p-5 rounded-lg bg-[#F5F5F7] border border-black/[0.04] transition-all hover:bg-neutral-100/80">
            <span className="text-2xl xl:text-3xl font-semibold text-[#1D1D1F] tracking-tight block mb-1">
              68%
            </span>
            <p className="text-xs text-[#86868B] leading-relaxed">
              Giảm thời gian phản hồi tin nhắn đầu tiên với AI Copilot tích hợp.
            </p>
          </div>

          <div className="p-5 rounded-lg bg-[#F5F5F7] border border-black/[0.04] transition-all hover:bg-neutral-100/80">
            <span className="text-2xl xl:text-3xl font-semibold text-[#1D1D1F] tracking-tight block mb-1">
              99.99%
            </span>
            <p className="text-xs text-[#86868B] leading-relaxed">
              Cam kết Uptime SLA với mã hóa dữ liệu đầu cuối 256-bit AES.
            </p>
          </div>
        </div>

        {/* Testimonial Spotlight */}
        <div className="p-6 rounded-lg bg-[#F5F5F7] border border-black/[0.04]">
          <p className="text-sm text-[#1D1D1F] font-normal leading-relaxed mb-4">
            &ldquo;Chat Center đem lại trải nghiệm sang trọng và chuẩn xác như hệ điều hành macOS. Đội ngũ CSKH của chúng tôi tăng gấp 3 năng suất xử lý mà không hề cảm thấy mệt mỏi.&rdquo;
          </p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-xs font-semibold text-white">
              AT
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#1D1D1F]">Alex Turner</h4>
              <p className="text-[11px] text-[#86868B]">VP of Experience @ FinScale Global</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Security Badge */}
      <div className="relative z-10 pt-4 border-t border-black/[0.06] flex items-center justify-between text-xs text-[#86868B]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Chứng nhận bảo mật SOC2 Type II &amp; ISO 27001</span>
        </div>
        <span>Apple Silicon &amp; WebKit Optimized</span>
      </div>
    </section>
  );
}
