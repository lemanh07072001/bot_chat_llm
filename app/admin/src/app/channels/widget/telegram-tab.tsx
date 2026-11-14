"use client";

import { useEffect, useState } from "react";
import { Select } from "@/components/ui";
import { loadTelegram, saveTelegram, testTelegram, type TelegramSettings } from "./telegram-actions";

const INPUT = "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15";

export function TelegramTab({ siteId, staff }: { siteId: string; staff: { id: string; name: string; email: string }[] }) {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    void loadTelegram(siteId).then(result => {
      if (cancelled) return;
      if (result.data) setSettings(result.data);
      else setNotice(result.error);
    });
    return () => { cancelled = true; };
  }, [siteId]);

  return <div className="space-y-4 max-w-2xl">
    <div className="text-xs text-neutral-600 space-y-2">
      <h3 className="text-sm font-semibold text-neutral-900">Telegram hai chiều</h3>
      <p>Mỗi dự án dùng một supergroup riêng đã bật Topics. Thêm bot làm admin, cấp quyền Manage Topics. Mỗi hội thoại có một topic; chỉ Reply đúng tin của bot mới gửi về khách. Tin thường trong nhóm không gửi ra ngoài.</p>
      <p>Liên kết Telegram ID dạng số với tài khoản Chat Center có quyền trong dự án. Quyền được kiểm tra lại mỗi lần trả lời. Hiện hỗ trợ tin văn bản; không chuyển ảnh, file, tin chỉnh sửa hoặc hội thoại đã đóng.</p>
      <p>Bot nhận tin bằng polling, không cần webhook/HTTPS để thử local. Không chạy cùng bot trên local và VPS hoặc ứng dụng khác. Token lưu mã hóa ở backend, không trả lại trình duyệt. Nội dung chat sẽ được chuyển cho Telegram khi bật.</p>
    </div>
    {notice && <p role="status" className="text-sm text-orange-700 whitespace-pre-wrap">{notice}</p>}
    {!settings ? <p className="text-sm text-neutral-500">{notice ? "Không tải được cấu hình. Hãy mở lại tab để thử lại." : "Đang tải…"}</p> :
      <form className="space-y-4" onSubmit={async event => {
        event.preventDefault();
        if (settings.responders.some(responder => !responder.userId)) {
          setNotice("Chọn tài khoản Chat Center cho từng người trả lời.");
          return;
        }
        setBusy(true); setNotice("");
        try {
          const result = await saveTelegram(siteId, {
            enabled: settings.enabled, chatId: settings.chatId, responders: settings.responders,
            ...(token.trim() ? { botToken: token.trim() } : {}),
          });
          if (result.data) { setSettings(result.data); setToken(""); setNotice("Đã lưu cấu hình Telegram."); }
          else setNotice(result.error);
        } finally { setBusy(false); }
      }}>
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e => setSettings({ ...settings, enabled: e.target.checked })} />Bật Telegram cho dự án</label>
          <label className="block text-xs space-y-1"><span>Bot token {settings.configured ? "(để trống để giữ nguyên)" : ""}</span><input className={INPUT} type="password" autoComplete="new-password" value={token} onChange={e => setToken(e.target.value)} required={!settings.configured} maxLength={200} /></label>
          <label className="block text-xs space-y-1"><span>ID nhóm Telegram (ví dụ -1001234567890)</span><input className={INPUT} value={settings.chatId} onChange={e => setSettings({ ...settings, chatId: e.target.value.trim() })} required pattern="-100[0-9]{5,16}" /></label>
          <div className="space-y-2">
            <h4 className="text-xs font-semibold">Người được phép trả lời</h4>
            {settings.responders.map((responder, index) => <div key={index} className="flex flex-wrap gap-2">
              <input aria-label={`Telegram ID ${index + 1}`} className={`${INPUT} flex-1 min-w-32`} placeholder="Telegram user ID" value={responder.telegramId} pattern="[1-9][0-9]{0,15}" required onChange={e => setSettings({ ...settings, responders: settings.responders.map((r, i) => i === index ? { ...r, telegramId: e.target.value.trim() } : r) })} />
              <div className="flex-1 min-w-40">
                <Select
                  aria-label={`Tài khoản ${index + 1}`}
                  required
                  disabled={busy}
                  placeholder="Chọn tài khoản Chat Center"
                  emptyLabel="Chưa có tài khoản"
                  value={responder.userId}
                  options={staff.map(user => ({ value: user.id, label: user.name, hint: user.email }))}
                  onChange={userId => setSettings({ ...settings, responders: settings.responders.map((r, i) => i === index ? { ...r, userId } : r) })}
                />
              </div>
              <button type="button" className="text-xs text-red-600" onClick={() => setSettings({ ...settings, responders: settings.responders.filter((_, i) => i !== index) })}>Xóa</button>
            </div>)}
            <button type="button" className="text-xs text-orange-700" disabled={settings.responders.length >= 50} onClick={() => setSettings({ ...settings, responders: [...settings.responders, { telegramId: "", userId: "" }] })}>+ Thêm người trả lời</button>
          </div>
          {settings.lastError && <p role="alert" className="text-xs text-red-600">{settings.lastError}</p>}
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-orange-600 px-3 py-2 text-xs text-white">{busy ? "Đang xử lý…" : "Lưu Telegram"}</button>
            <button type="button" disabled={!settings.configured} className="rounded-lg border px-3 py-2 text-xs" onClick={async () => {
              setBusy(true);
              try { const result = await testTelegram(siteId); setNotice(result.data ? "Đã tạo topic và gửi tin kiểm tra bằng cấu hình đã lưu." : result.error); }
              finally { setBusy(false); }
            }}>Gửi thử cấu hình đã lưu</button>
          </div>
          <p className="text-xs text-neutral-500">Lần đầu bật chỉ chuyển tin mới, không chuyển lịch sử cũ. Tắt rồi bật lại cùng cấu hình sẽ tiếp tục từ tin đã xử lý. Đổi bot/nhóm sẽ bắt đầu liên kết mới.</p>
        </fieldset>
      </form>}
  </div>;
}
