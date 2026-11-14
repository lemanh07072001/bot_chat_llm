"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { announcePreferences, DEFAULT_CANNED_RESPONSES } from "../inbox/preferences";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: "", jobTitle: "", avatarUrl: "" });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [templates, setTemplates] = useState<string[]>([]);
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
      setTemplates(data.cannedResponses ?? DEFAULT_CANNED_RESPONSES);
      setLoading(false);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);

  async function save() {
    if (busyRef.current || loading) return;
    if (tab === "password" && passwords.newPassword !== passwords.confirm) { setError("Mật khẩu xác nhận chưa khớp."); return; }
    if (tab === "preferences" && templates.some((text) => !text.trim())) { setError("Hãy nhập hoặc xóa mẫu câu trống."); return; }
    busyRef.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = tab === "profile" ? profile : tab === "preferences" ? { soundEnabled, cannedResponses: templates } : { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword };
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
  return <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose} className="m-auto w-[min(94vw,560px)] rounded-2xl p-5 shadow-xl backdrop:bg-black/40">
    <div className="flex justify-between items-center"><h2 className="font-semibold text-[#1D1D1F]">Tài khoản &amp; tùy chọn</h2><button type="button" disabled={busy} onClick={() => dialog.current?.close()} aria-label="Đóng" className="p-1 rounded-md text-neutral-400 hover:text-neutral-700">✕</button></div>
    <div className="flex gap-3 my-4 border-b pb-2 text-sm">{[["profile", "Thông tin"], ["preferences", "Mẫu câu & âm thanh"], ["password", "Mật khẩu"]].map(([key, title]) => <button key={key} type="button" disabled={busy} onClick={() => { setTab(key); setError(""); setNotice(""); }} className={`cursor-pointer transition-colors ${tab === key ? "text-amber-700 font-semibold border-b-2 border-amber-600 pb-1" : "text-neutral-500 hover:text-neutral-800"}`}>{title}</button>)}</div>
    {loading ? <p className="text-sm text-neutral-500">Đang tải tài khoản…</p> : <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-3">
      {tab === "profile" && <>
        <label className="block text-sm font-medium text-[#1D1D1F]">Tên hiển thị<input required maxLength={100} className={fieldClass} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Chức danh<input maxLength={60} className={fieldClass} value={profile.jobTitle} onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })} /></label>
        <label className="block text-sm font-medium text-[#1D1D1F]">Đường dẫn avatar<input maxLength={2048} className={fieldClass} value={profile.avatarUrl} onChange={(e) => setProfile({ ...profile, avatarUrl: e.target.value })} placeholder="https://…" /></label>
      </>}
      {tab === "preferences" && <>
        <label className="flex gap-2 text-sm font-medium text-[#1D1D1F] items-center cursor-pointer"><input type="checkbox" className="accent-amber-600 rounded" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />Âm thanh khi có tin mới</label>
        <p className="text-xs text-neutral-500">Mẫu câu cá nhân, lưu theo tài khoản. Tối đa 30 mẫu; chọn mẫu chỉ chèn vào ô soạn, không tự gửi.</p>
        <div className="max-h-64 overflow-y-auto space-y-2">{templates.map((text, index) => <div key={index} className="flex items-start gap-2"><textarea aria-label={`Mẫu câu ${index + 1}`} required maxLength={4000} rows={2} className={fieldClass} value={text} onChange={(e) => setTemplates(templates.map((row, i) => i === index ? e.target.value : row))} /><button type="button" aria-label={`Xóa mẫu ${index + 1}`} onClick={() => setTemplates(templates.filter((_, i) => i !== index))} className="text-rose-600 text-xs mt-2 hover:underline">Xóa</button></div>)}</div>
        <button type="button" disabled={templates.length >= 30} onClick={() => setTemplates([...templates, ""])} className="text-sm text-amber-700 hover:text-amber-800 font-medium disabled:opacity-50 cursor-pointer">+ Thêm mẫu</button>
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
