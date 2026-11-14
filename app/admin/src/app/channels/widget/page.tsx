import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, AlertTriangle, ArrowLeft } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { getCurrentUser, getToken } from "@/lib/session";
import type { Site, WidgetBuild } from "@/lib/sites";
import { SitesClient, type StaffRef } from "./sites-client";

export default async function WidgetChannelPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Creating sites and rotating keys is admin-only on the api too.
  if (user.role !== "admin") {
    return (
      <DashboardLayout user={user}>
        <main className="w-full px-2 sm:px-3 py-10 flex items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl border border-black/[0.06] p-6 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-semibold text-[#1D1D1F]">Không có quyền truy cập</h1>
            <p className="mt-1.5 text-xs text-[#86868B] leading-relaxed">
              Cấu hình kênh Live Chat Widget chỉ dành cho Quản trị viên cấp cao. Bạn vẫn trả lời
              khách bình thường trong Hộp thư đến.
            </p>
            <div className="mt-4">
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 transition shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Về hộp thư đến</span>
              </Link>
            </div>
          </div>
        </main>
      </DashboardLayout>
    );
  }

  const token = await getToken();
  const authHeaders = { Authorization: `Bearer ${token}` };

  const [sites, build, staff] = await Promise.all([
    apiFetch<Site[]>("/sites", { headers: authHeaders, cache: "no-store" }),
    apiFetch<WidgetBuild>("/widget-build", { headers: authHeaders, cache: "no-store" }),
    // The pool to grant project access from. Admin-only on the api, which is
    // fine because this page is admin-only too.
    apiFetch<StaffRef[]>("/users", { headers: authHeaders, cache: "no-store" }),
  ]);

  return (
    <DashboardLayout user={user}>
      <main className="w-full px-1.5 sm:px-2.5 py-2.5 sm:py-3.5">
        {sites.ok ? (
          // A failed build lookup is not fatal: the snippet still works, the
          // operator just doesn't get the "bundle is live" readout.
          <SitesClient
            sites={sites.data}
            build={build.ok ? build.data : null}
            staff={staff.ok ? staff.data : []}
          />
        ) : (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800 flex items-start gap-3 shadow-xs"
          >
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold">Không thể tải danh sách site</h2>
              <p className="mt-1 text-xs text-red-700">
                Lỗi kết nối máy chủ: {sites.error}. Kiểm tra API có đang chạy, rồi tải lại trang.
              </p>
              <Link
                href="/channels/widget"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-900 underline hover:no-underline"
              >
                Thử lại ngay
              </Link>
            </div>
          </div>
        )}
      </main>
    </DashboardLayout>
  );
}
