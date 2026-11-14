import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Settings, RefreshCw } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { listConversations, listMessages } from "@/lib/chat-api";
import { filterToQuery, isInboxFilter } from "@/lib/chat";
import { InboxClient } from "@/components/inbox/InboxClient";

/** The api base the browser should open its socket against. */
function resolveApiOrigin(): string {
  const raw = process.env.PUBLIC_REALTIME_URL ?? process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3003";

  if (!raw) {
    return "";
  }

  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/logout");
  }

  // The sidebar links straight to ?filter=unassigned; after that the tabs are
  // client state, so switching them does not tear down the socket.
  const params = await searchParams;
  const filter = isInboxFilter(params.filter) ? params.filter : "all";

  const result = await listConversations(filterToQuery(filter));
  const apiOrigin = resolveApiOrigin();
  const requestedId = typeof params.conversation === 'string' ? params.conversation : null;
  let initialThread = null;
  if (result.ok) {
    const candidateId = requestedId ?? result.data.conversations[0]?.id;
    if (candidateId) {
      // Authenticated server fetch: messages are already in the first HTML response.
      const thread = await listMessages(candidateId);
      if (thread.ok) {
        initialThread = thread.data;
        if (!result.data.conversations.some((item) => item.id === thread.data.conversation.id)) {
          result.data.conversations.unshift(thread.data.conversation);
        }
      }
    }
  }

  return (
    <DashboardLayout user={user} fullHeight>
      {!result.ok ? (
        <main className="w-full px-4 py-8 flex items-center justify-center flex-1">
          <div className="max-w-md w-full p-6 rounded-xl bg-white border border-rose-200 shadow-sm text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-sm font-semibold text-slate-900 mb-1">
              Không thể tải hộp thư đến
            </h1>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Lỗi kết nối máy chủ: {result.error}. Vui lòng thử tải lại trang hoặc kiểm tra kết nối API.
            </p>
            <Link
              href="/inbox"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-semibold hover:from-amber-700 hover:to-orange-700 transition shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tải lại trang</span>
            </Link>
          </div>
        </main>
      ) : !apiOrigin ? (
        <main className="w-full px-4 py-8 flex items-center justify-center flex-1">
          <div className="max-w-md w-full p-6 rounded-xl bg-white border border-amber-200 shadow-sm text-center">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <Settings className="w-6 h-6" />
            </div>
            <h1 className="text-sm font-semibold text-slate-900 mb-1">
              Chưa hoàn tất cấu hình hệ thống
            </h1>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Chưa thiết lập biến môi trường <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">NEXT_PUBLIC_API_URL</code>, nên trình duyệt chưa thể mở kết nối realtime tới máy chủ.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-semibold hover:from-amber-700 hover:to-orange-700 transition shadow-xs cursor-pointer"
            >
              Quay về trang chủ
            </Link>
          </div>
        </main>
      ) : (
        <InboxClient
          initial={result.data}
          initialThread={initialThread}
          initialFilter={filter}
          currentUser={{ id: user.id, name: user.name, role: user.role }}
          apiOrigin={apiOrigin}
        />
      )}
    </DashboardLayout>
  );
}
