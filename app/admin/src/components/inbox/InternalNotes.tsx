"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Note = { id: string; authorName: string; body: string; createdAt: string };

export function InternalNotes({ conversationId }: { conversationId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const requestVersion = useRef(0);
  const load = useCallback(async (before?: string) => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không tải được ghi chú.");
      if (version !== requestVersion.current) return;
      setNotes((previous) => before ? [...previous, ...data.notes.filter((note: Note) => !previous.some((row) => row.id === note.id))] : data.notes);
      setCursor(data.nextCursor);
      setError(null);
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "Không tải được ghi chú.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    const version = requestVersion;
    return () => { clearTimeout(timer); version.current++; };
  }, [load]);

  async function save() {
    if (!draft.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    // Invalidate a refresh started before this save so it cannot hide the new note.
    requestVersion.current++;
    setLoading(false);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: draft.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không lưu được ghi chú.");
      setNotes((previous) => [data.note, ...previous]);
      setDraft("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không lưu được ghi chú. Hãy làm mới để kiểm tra trước khi gửi lại.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="border-t border-neutral-200 p-4 space-y-3 bg-amber-50/40">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-neutral-900">Ghi chú nội bộ</h3>
        <button type="button" disabled={loading || saving} onClick={() => void load()} className="text-xs text-amber-700 hover:text-amber-900 font-medium disabled:opacity-50">Làm mới</button>
      </div>
      <p className="text-[11px] text-neutral-500">Chỉ nhân viên trong dự án xem được. Không gửi cho khách.</p>
      <textarea aria-label="Nội dung ghi chú nội bộ" value={draft} onChange={(event) => setDraft(event.target.value)} disabled={saving} maxLength={4000} rows={3} placeholder="Thông tin cần bàn giao…" className="w-full rounded-lg border border-amber-200 bg-white p-2 text-xs outline-none focus:border-amber-500" />
      <button type="button" onClick={() => void save()} disabled={saving || !draft.trim()} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu ghi chú"}</button>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {loading && <p className="text-xs text-neutral-500">Đang tải…</p>}
      {!loading && !error && notes.length === 0 && <p className="text-xs text-neutral-500">Chưa có ghi chú.</p>}
      <ul className="space-y-2">
        {notes.map((note) => <li key={note.id} className="rounded-lg border border-amber-200/70 bg-white p-2 text-xs">
          <div className="font-semibold text-neutral-800">{note.authorName}</div>
          <time className="text-[10px] text-neutral-500" dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString("vi-VN")}</time>
          <p className="mt-1 whitespace-pre-wrap wrap-break-word text-neutral-700">{note.body}</p>
        </li>)}
      </ul>
      {cursor && <button type="button" disabled={loading || saving} onClick={() => void load(cursor)} className="text-xs text-amber-700 hover:text-amber-900 font-medium disabled:opacity-50">Ghi chú cũ hơn</button>}
    </section>
  );
}
