"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { announcePreferences } from "../inbox/preferences";
import {
  CANNED_MAX_TEMPLATES,
  cleanCannedTemplates,
  resolvePersonalTemplates,
  validateCannedTemplates,
  type CannedTemplate,
} from "@/lib/canned";
import { TemplateRows } from "@/components/canned/TemplateRows";
import { NOTIFY_SCOPE_OPTIONS, isNotifyScope, type NotifyScope } from "@/lib/notifications";
import {
  PushError,
  disablePush,
  enablePush,
  getDeviceSubscription,
  getPushPublicKey,
  pushSupported,
} from "@/components/notifications/push-client";

const TABS = [
  ["profile", "Thông tin"],
  ["preferences", "Mẫu câu & âm thanh"],
  ["password", "Mật khẩu"],
] as const;

export function AccountDialog({
  initialTab = "profile",
  onClose,
}: {
  initialTab?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [profile, setProfile] = useState({ name: "", jobTitle: "", avatarUrl: "" });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifyScope, setNotifyScope] = useState<NotifyScope>("mine_unassigned");
  const [emailMissed, setEmailMissed] = useState(true);
  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">("default");
  const [pushState, setPushState] = useState<"checking" | "unsupported" | "push-disabled" | "off" | "on">("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushHint, setPushHint] = useState("");

  useEffect(() => {
    setDesktopPermission("Notification" in window ? Notification.permission : "unsupported");

    let cancelled = false;
    void (async () => {
      if (!pushSupported()) {
        if (!cancelled) setPushState("unsupported");
        return;
      }
      const [subscription, publicKey] = await Promise.all([getDeviceSubscription(), getPushPublicKey()]);
      if (cancelled) return;
      if (subscription) setPushState("on");
      else if (!publicKey) setPushState("push-disabled");
      else setPushState("off");
    })();

    return () => { cancelled = true; };
  }, []);
  const [templates, setTemplates] = useState<CannedTemplate[]>([]);
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const busyRef = useRef(false);

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch("/api/account/profile", { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không tải được tài khoản.");
      setProfile({ name: data.name, jobTitle: data.jobTitle ?? "", avatarUrl: data.avatarUrl ?? "" });
      setSoundEnabled(data.soundEnabled ?? true);
      setNotifyScope(isNotifyScope(data.notifyScope) ? data.notifyScope : "mine_unassigned");
      setEmailMissed(data.emailMissed ?? true);
      setTemplates(resolvePersonalTemplates(data));
      setLoading(false);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);

  async function save() {
    if (busyRef.current || loading) return;
    if (tab === "password" && passwords.newPassword !== passwords.confirm) { setError("Mật khẩu xác nhận chưa khớp."); return; }

    if (tab === "preferences") {
      const invalid = validateCannedTemplates(templates);
      if (invalid) { setError(invalid); return; }
    }

    busyRef.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = tab === "profile"
        ? profile
        : tab === "preferences"
          // The api stores the templates and derives the plain-text list from
          // them, so a client that only knows the old shape sees the same rows.
          ? { soundEnabled, notifyScope, emailMissed, cannedResponseTemplates: cleanCannedTemplates(templates) }
          : { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword };
      const response = await fetch(`/api/account/${tab}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không lưu được thay đổi.");
      if (tab === "password") { router.replace("/login?passwordChanged=1"); router.refresh(); return; }
      if (tab === "preferences") announcePreferences(data);
      router.refresh();
      setNotice("Đã lưu thay đổi.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không kết nối được máy chủ."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const fieldClass = "w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-500/20";

  async function requestDesktopPermission() {
    if (!("Notification" in window)) { setDesktopPermission("unsupported"); return; }
    try {
      const permission = await Notification.requestPermission();
      setDesktopPermission(permission);
    } catch {
      // Old Safari rejects the promise instead of resolving; the state below
      // then keeps showing the browser's current answer.
      setDesktopPermission(Notification.permission);
    }
  }

  async function togglePush() {
    if (pushBusy) return;
    setPushBusy(true); setPushHint("");
    try {
      if (pushState === "on") {
        await disablePush();
        setPushState("off");
      } else {
        await enablePush();
        setPushState("on");
      }
    } catch (cause) {
      if (cause instanceof PushError) {
        if (cause.code === "push-disabled") setPushState("push-disabled");
        else if (cause.code === "unsupported") setPushState("unsupported");
        setPushHint(cause.message);
      } else {
        setPushHint("Không thay đổi được thông báo đẩy.");
      }
    } finally {
      setPushBusy(false);
    }
  }

  return <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose} className="m-auto w-[min(94vw,560px)] rounded-2xl p-5 shadow-xl backdrop:bg-black/40">
    <div className="flex justify-between items-center"><h2 className="font-semibold text-[#1D1D1F]">Tài khoản &amp; tùy chọn</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Đóng" className="p-1 rounded-md text-neutral-400 hover:text-neutral-700">✕</button></div>
    <div className="flex gap-3 my-4 border-b pb-2 text-sm">{TABS.map(([key, title]) => <button key={key} type="button" disabled={busy} onClick={() => { setTab(key); setError(""); setNotice(""); }} className={`cursor-pointer transition-colors ${tab === key ? "text-amber-700 font-semibold border-b-2 border-amber-600 pb-1" : "text-neutral-500 hover:text-neutral-800"}`}>{title}</button>)}</div>
    {loading ? <p className="text-sm text-neutral-500">Đang tải tài khoản…</p> : <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
      {tab === "profile" && <>
        <label className="block text-sm font-medium text-[#1D1D1F]">Tên hiển thị<input required maxLength={100} className={fieldClass} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Chức danh<input maxLength={60} className={fieldClass} value={profile.jobTitle} onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Đường dẫn avatar<input maxLength={2048} className={fieldClass} value={profile.avatarUrl} onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })} placeholder="https://…" /></label>
      </>}
      {tab === "preferences" && <>
        <div className="rounded-xl border border-black/[0.06] bg-[#F8F9FA] p-3 space-y-3">
          <p className="text-sm font-semibold text-[#1D1D1F]">Thông báo</p>

          <fieldset className="space-y-1.5" disabled={busy}>
            <legend className="text-xs font-medium text-neutral-600 mb-1">Hội thoại cần thông báo</legend>
            {NOTIFY_SCOPE_OPTIONS.map((option) => <label key={option.value} className="flex gap-2 text-sm text-[#1D1D1F] items-center cursor-pointer">
              <input
                type="radio"
                name="notifyScope"
                className="accent-amber-600"
                value={option.value}
                checked={notifyScope === option.value}
                onChange={() => setNotifyScope(option.value)}
              />
              {option.label}
            </label>)}
          </fieldset>

          <label className="flex gap-2 text-sm font-medium text-[#1D1D1F] items-center cursor-pointer"><input type="checkbox" className="accent-amber-600 rounded" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />Âm thanh khi có tin mới</label>

          <label className="flex gap-2 text-sm font-medium text-[#1D1D1F] items-center cursor-pointer"><input type="checkbox" className="accent-amber-600 rounded" checked={emailMissed} onChange={(e) => setEmailMissed(e.target.checked)} />Gửi email khi khách chờ quá lâu chưa được trả lời</label>

          <div className="pt-2 border-t border-black/[0.06] space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[#1D1D1F]">Thông báo trên màn hình</span>
              {desktopPermission === "unsupported"
                ? <span className="text-xs text-neutral-500">Trình duyệt không hỗ trợ</span>
                : desktopPermission === "granted"
                  ? <span className="text-xs font-medium text-emerald-700">Đã bật</span>
                  : desktopPermission === "denied"
                    ? <span className="text-xs text-neutral-500">Chưa bật</span>
                    : <span className="flex items-center gap-2">
                        <span className="text-xs text-neutral-500">Chưa bật</span>
                        <button type="button" onClick={() => void requestDesktopPermission()} className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 cursor-pointer">Bật</button>
                      </span>}
            </div>
            {desktopPermission === "denied" && <p className="text-xs text-amber-800">Trình duyệt đang chặn thông báo. Bấm biểu tượng ổ khoá cạnh thanh địa chỉ → Thông báo → Cho phép.</p>}

            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[#1D1D1F]">Nhận thông báo khi đã đóng tab (thiết bị này)</span>
              {pushState === "checking"
                ? <span className="text-xs text-neutral-400">Đang kiểm tra…</span>
                : <span className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${pushState === "on" ? "text-emerald-700" : "text-neutral-500"}`}>{pushState === "on" ? "Đã bật" : "Chưa bật"}</span>
                    <button
                      type="button"
                      disabled={busy || pushBusy || pushState === "unsupported" || pushState === "push-disabled"}
                      onClick={() => void togglePush()}
                      aria-pressed={pushState === "on"}
                      className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {pushBusy ? "Đang lưu…" : pushState === "on" ? "Tắt" : "Bật"}
                    </button>
                  </span>}
            </div>
            {pushState === "unsupported" && <p className="text-xs text-neutral-500">Trình duyệt này không hỗ trợ thông báo đẩy.</p>}
            {pushState === "push-disabled" && <p className="text-xs text-neutral-500">Máy chủ chưa cấu hình thông báo đẩy.</p>}
            {pushHint && <p className="text-xs text-amber-800">{pushHint}</p>}
          </div>
        </div>

        <p className="text-xs text-neutral-500">
          Mẫu câu cá nhân, lưu theo tài khoản và chỉ bạn thấy. Tối đa {CANNED_MAX_TEMPLATES} mẫu.
          Gõ <code className="rounded bg-neutral-100 px-1">/phím-tắt</code> trong ô soạn để chèn nhanh;
          chọn mẫu chỉ chèn vào ô soạn, không tự gửi.
        </p>
        <TemplateRows
          templates={templates}
          onChange={setTemplates}
          disabled={busy}
          emptyHint="Bạn đã xóa hết mẫu câu cá nhân. Bộ mẫu chung và bộ mẫu của dự án vẫn dùng được."
        />
      </>}
      {tab === "password" && <>
        <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">Đổi mật khẩu sẽ hết hiệu lực các phiên cũ. Bạn cần đăng nhập lại.</p>
        <label className="block text-sm font-medium text-[#1D1D1F]">Mật khẩu hiện tại<input type="password" autoComplete="current-password" required maxLength={72} className={fieldClass} value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Mật khẩu mới<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={fieldClass} value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} /></label>
      </>}
      <button disabled={busy} className="rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 px-4 py-2 text-sm text-white font-medium shadow-xs disabled:opacity-50 cursor-pointer">{busy ? "Đang lưu…" : "Lưu thay đổi"}</button>
    </form>}
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}
  </dialog>;
}
