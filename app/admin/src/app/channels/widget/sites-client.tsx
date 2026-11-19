"use client";

import React, {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCheck,
  CircleDot,
  Clock,
  Code2,
  Copy,
  Globe,
  Key,
  Lock,
  Package,
  Palette,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  CheckboxField,
  ChoiceChips,
  Field,
  Menu,
  MenuHeader,
  MenuItem,
  MenuNote,
  MenuSeparator,
  Select,
  TabPanel,
  Tabs,
} from "@/components/ui";
import {
  DEFAULT_OFFICE_HOURS,
  WEEKDAY_LABELS,
  isOwnedSite,
  parseOrigins,
  type OwnedSite,
  type Site,
  type WidgetBuild,
} from "@/lib/sites";
import {
  deleteSite,
  rotateSiteKey,
  saveSite,
  setSiteActive,
  type SiteActionState,
} from "./actions";
import { SiteImage, SiteImageField, useSiteImage } from "./site-image";
import { WidgetPreview } from "./widget-preview";
import { TelegramTab } from "./telegram-tab";
import { CannedTab, GlobalCannedDialog } from "./canned-tab";

/** A staff account that can be granted access to a project. */
export type StaffRef = { id: string; name: string; email: string; role: string };

type MemberView = {
  userId: string;
  name: string;
  email: string | null;
  role: "owner" | "manager";
  addedAt: string | null;
};

type SiteTab = "embed" | "config" | "people" | "canned" | "operations" | "telegram";

const THEME_PRESETS = ["#EA580C", "#16A34A", "#9333EA", "#EA580C", "#DC2626", "#0F172A"];

const INPUT_CLASS =
  "w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-[#1D1D1F] placeholder:text-neutral-400 outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15";

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
}

function formatBytes(size: number) {
  return `${(size / 1024).toFixed(0)} KB`;
}

/** A manager is not sent the allowlist, so every read has to cope with it being absent. */
function originsOf(site: Site): string[] {
  return site.allowedOrigins ?? [];
}

function originsSummary(site: Site): string {
  const origins = originsOf(site);

  if (origins.length === 0) return "Mọi origin đều nhúng được";
  if (origins.length === 1) return origins[0];

  return `${origins[0]} +${origins.length - 1}`;
}

/**
 * A live dot, pulsing while the widget is serving visitors.
 *
 * The ping ring is purely decorative, so it sits behind a solid dot that
 * carries the colour on its own and is dropped for anyone who asked for less
 * motion.
 */
function StatusDot({ active, tone = "color" }: { active: boolean; tone?: "color" | "onSolid" }) {
  if (!active) {
    return <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-neutral-300" />;
  }

  const fill = tone === "onSolid" ? "bg-white" : "bg-emerald-500";

  return (
    <span className="relative grid w-1.5 h-1.5 shrink-0 place-items-center">
      <span className={`absolute w-full h-full rounded-full opacity-75 motion-safe:animate-ping ${fill}`} />
      <span className={`relative w-full h-full rounded-full ${fill}`} />
    </span>
  );
}

/**
 * Whether the widget is live, stated loudly.
 *
 * It is the first thing an operator checks and the one thing a project cannot
 * show anywhere else on the page, so the running state gets a filled badge
 * instead of a third quiet grey pill. Being off stays muted on purpose: the
 * contrast is what makes the live state readable at a glance.
 */
function SiteStatus({ active }: { active: boolean }) {
  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
        active
          ? "bg-emerald-500 text-white border-emerald-600/20 shadow-[0_1px_5px_rgba(16,185,129,0.45)]"
          : "bg-neutral-100 text-neutral-500 border-neutral-200"
      }`}
    >
      <StatusDot active={active} tone="onSolid" />
      {active ? "Đang chạy" : "Đã tắt"}
    </span>
  );
}

/** Copies text and shows a tick briefly. Clipboard access can be denied, so a failure says so. */
function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!copied && !failed) {
      return;
    }

    const timer = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, [copied, failed]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition border ${
        copied
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : failed
            ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-white text-[#1D1D1F] border-neutral-200 hover:border-neutral-300"
      } ${className}`}
    >
      {copied ? <CheckCheck className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      <span>{copied ? "Đã copy" : failed ? "Hãy copy tay" : label}</span>
    </button>
  );
}

/**
 * The widget's appearance, held here rather than inside the inputs, because the
 * live preview has to read the same values as the operator types.
 */
function useSiteFormState(site?: Site) {
  const [name, setName] = useState(site?.name ?? "");
  const [title, setTitle] = useState(site?.settings.title ?? "Chat với chúng tôi");
  const [themeColor, setThemeColor] = useState(site?.settings.themeColor ?? THEME_PRESETS[0]);
  const [greeting, setGreeting] = useState(
    site?.settings.greeting ?? "Xin chào! Chúng tôi có thể giúp gì cho bạn?",
  );
  const [originsRaw, setOriginsRaw] = useState((site?.allowedOrigins ?? []).join("\n"));
  const image = useSiteImage(site?.settings.imageUrl);

  const origins = useMemo(() => parseOrigins(originsRaw), [originsRaw]);

  return {
    name,
    setName,
    title,
    setTitle,
    themeColor,
    setThemeColor,
    greeting,
    setGreeting,
    originsRaw,
    setOriginsRaw,
    origins,
    image,
  };
}

type SiteFormState = ReturnType<typeof useSiteFormState>;

function SiteFormFields({ state }: { state: SiteFormState }) {
  return (
    <>
      <Field
        label="Tên dự án"
        required
        hint="Chỉ hiển thị nội bộ, để nhân viên biết hội thoại đến từ website nào."
      >
        <input
          name="name"
          value={state.name}
          onChange={(event) => state.setName(event.target.value)}
          required
          maxLength={100}
          placeholder="Ví dụ: Website bán hàng chính"
          className={INPUT_CLASS}
        />
      </Field>

      <SiteImageField state={state.image} name="imageUrl" />

      <Field label="Tiêu đề hộp chat" required>
        <input
          name="title"
          value={state.title}
          onChange={(event) => state.setTitle(event.target.value)}
          required
          maxLength={60}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Màu chủ đề" required>
        <div className="flex items-center gap-2">
          {/* The palette and the picker are two ways into one value, which this
              hidden field is what actually submits. */}
          <input type="hidden" name="themeColor" value={state.themeColor} />
          <input
            type="color"
            value={state.themeColor}
            onChange={(event) => state.setThemeColor(event.target.value.toUpperCase())}
            aria-label="Chọn màu chủ đề"
            className="w-9 h-9 rounded-xl border border-neutral-200 bg-white p-0.5 cursor-pointer shrink-0"
          />
          <input
            value={state.themeColor}
            onChange={(event) => state.setThemeColor(event.target.value.toUpperCase())}
            maxLength={7}
            aria-label="Mã màu hex"
            className="w-24 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-mono text-[#1D1D1F] outline-none transition focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/15"
          />
          <ChoiceChips
            name="themeColorPreset"
            swatchOnly
            options={THEME_PRESETS.map((preset) => ({
              value: preset,
              label: preset,
              swatch: preset,
            }))}
            value={state.themeColor}
            onChange={state.setThemeColor}
          />
        </div>
      </Field>

      <Field label="Lời chào" required hint="Câu đầu tiên khách thấy khi mở hộp chat.">
        <textarea
          name="greeting"
          value={state.greeting}
          onChange={(event) => state.setGreeting(event.target.value)}
          required
          maxLength={200}
          rows={2}
          className={`${INPUT_CLASS} resize-none`}
        />
      </Field>

      <Field
        label="Origin được phép nhúng"
        hint={
          <>
            Mỗi dòng một origin, chỉ gồm scheme + domain (+ cổng), không kèm đường dẫn. Nhớ khai cả
            bản <code className="font-mono">www</code> nếu website dùng cả hai.
          </>
        }
      >
        <textarea
          name="allowedOrigins"
          value={state.originsRaw}
          onChange={(event) => state.setOriginsRaw(event.target.value)}
          rows={3}
          placeholder={"https://example.com\nhttps://www.example.com"}
          className={`${INPUT_CLASS} font-mono resize-none placeholder:text-neutral-300`}
        />

        {state.origins.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span>
              Để trống nghĩa là <b>bất kỳ website nào</b> cũng nhúng được key này. Tiện khi mới tạo,
              nhưng trước khi chạy thật hãy khai báo đúng domain của bạn.
            </span>
          </p>
        ) : (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {state.origins.map((origin) => (
              <span
                key={origin}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-neutral-100 border border-neutral-200 text-[11px] font-mono text-[#1D1D1F]"
              >
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                {origin}
              </span>
            ))}
          </div>
        )}
      </Field>
    </>
  );
}

/**
 * Office hours are only edited on an existing project; the create form stays
 * short and the server keeps its defaults. `officeHoursPresent` is what tells
 * the action this form carried a schedule at all.
 */
function useOfficeHoursState(site: Site) {
  const stored = site.officeHours ?? DEFAULT_OFFICE_HOURS;
  const [enabled, setEnabled] = useState(stored.enabled);
  const [weekdays, setWeekdays] = useState<number[]>(stored.weekdays);
  const [offlineMessage, setOfflineMessage] = useState(stored.offlineMessage);

  return { stored, enabled, setEnabled, weekdays, setWeekdays, offlineMessage, setOfflineMessage };
}

function OfficeHoursFields({ state }: { state: ReturnType<typeof useOfficeHoursState> }) {
  const { stored, enabled } = state;

  return (
    <div className="rounded-xl border border-black/[0.06] p-3.5 space-y-3">
      <input type="hidden" name="officeHoursPresent" value="1" />

      <CheckboxField
        name="officeHoursEnabled"
        checked={enabled}
        onChange={state.setEnabled}
        label="Khai báo giờ làm việc"
        description="Ngoài giờ, widget hiện lời nhắn bên dưới và xin email của khách. Khách vẫn gửi được tin nhắn bất cứ lúc nào — việc này chỉ để họ biết khi nào được trả lời."
      />

      <div className={enabled ? "space-y-3" : "space-y-3 opacity-50"}>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2.5">
          <Field label="Múi giờ" size="sm">
            <input
              name="officeHoursTimezone"
              defaultValue={stored.timezone}
              maxLength={64}
              disabled={!enabled}
              className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-mono text-[#1D1D1F] outline-none transition focus:border-[#EA580C] disabled:bg-[#F5F5F7]"
            />
          </Field>
          <Field label="Mở cửa" size="sm">
            <input
              name="officeHoursFrom"
              type="time"
              defaultValue={stored.from}
              disabled={!enabled}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs text-[#1D1D1F] outline-none transition focus:border-[#EA580C] disabled:bg-[#F5F5F7]"
            />
          </Field>
          <Field label="Đóng cửa" size="sm">
            <input
              name="officeHoursTo"
              type="time"
              defaultValue={stored.to}
              disabled={!enabled}
              className="rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs text-[#1D1D1F] outline-none transition focus:border-[#EA580C] disabled:bg-[#F5F5F7]"
            />
          </Field>
        </div>

        <ChoiceChips
          multiple
          size="sm"
          name="officeHoursWeekdays"
          label="Ngày làm việc"
          disabled={!enabled}
          options={WEEKDAY_LABELS.map((day) => ({ value: String(day.value), label: day.label }))}
          value={state.weekdays.map(String)}
          onChange={(next) => state.setWeekdays(next.map(Number).sort((a, b) => a - b))}
          hint="Khoảng giờ qua nửa đêm (ví dụ 22:00 → 06:00) được hiểu là ca đêm bắt đầu từ ngày đã chọn."
        />

        <Field label="Lời nhắn ngoài giờ" size="sm">
          <textarea
            name="officeHoursOfflineMessage"
            value={state.offlineMessage}
            onChange={(event) => state.setOfflineMessage(event.target.value)}
            maxLength={300}
            rows={2}
            disabled={!enabled}
            className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs text-[#1D1D1F] outline-none transition resize-none focus:border-[#EA580C] disabled:bg-[#F5F5F7]"
          />
        </Field>
      </div>
    </div>
  );
}

function FormFeedback({ state }: { state: SiteActionState }) {
  if (!state.error && !state.success) {
    return null;
  }

  return (
    <div
      role="status"
      className={`rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${
        state.error
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {state.error ? (
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      ) : (
        <CheckCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      )}
      <span>{state.error ?? state.success}</span>
    </div>
  );
}

function CreateSiteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [state, formAction, pending] = useActionState(saveSite, {});
  const formState = useSiteFormState();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // The server action revalidates the page, so closing is enough to reveal the
  // new project — it arrives as fresh props.
  useEffect(() => {
    if (!state.success) {
      return;
    }

    const timer = setTimeout(onCreated, 700);

    return () => clearTimeout(timer);
  }, [state.success, onCreated]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-site-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(event) => {
        if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-3xl rounded-xl bg-white shadow-2xl border border-black/[0.08] overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        <div className="px-5 py-3.5 border-b border-black/[0.06] flex items-center justify-between bg-neutral-50/60">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-50 text-[#EA580C] grid place-items-center">
              <Globe className="w-4 h-4" />
            </span>
            <div>
              <h2 id="create-site-title" className="text-sm font-semibold text-[#1D1D1F]">
                Thêm dự án mới
              </h2>
              <p className="text-[11px] text-[#86868B]">
                Mỗi website là một dự án riêng, có key và cấu hình riêng.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={formAction} className="overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_14rem] gap-5 p-5">
            <div className="space-y-4">
              <SiteFormFields state={formState} />
              <FormFeedback state={state} />
            </div>

            <div className="md:border-l md:border-black/[0.06] md:pl-5">
              <p className="text-[11px] font-medium text-[#86868B] mb-2">Xem trước</p>
              <WidgetPreview
                title={formState.title}
                themeColor={formState.themeColor}
                greeting={formState.greeting}
                imageUrl={formState.image.imageUrl}
              />
            </div>
          </div>

          <div className="px-5 py-3 border-t border-black/[0.06] bg-neutral-50/60 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-[#1D1D1F] hover:border-neutral-300 transition"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-60 transition shadow-xs"
            >
              {pending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>{pending ? "Đang tạo..." : "Tạo dự án"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Shared frame for the two destructive confirmations. */
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  pendingLabel,
  pending,
  onClose,
  onConfirm,
  icon,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-black/[0.08] p-5 animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-red-50 text-red-600 grid place-items-center shrink-0">
            {icon}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#1D1D1F]">{title}</h2>
            <p className="mt-1.5 text-xs text-[#86868B] leading-relaxed">{body}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-neutral-200 bg-white text-xs font-medium text-[#1D1D1F] hover:border-neutral-300 disabled:opacity-60 transition"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-60 transition shadow-xs"
          >
            {pending && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{pending ? pendingLabel : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Tabs -------------------------------------------------------------------

function EmbedTab({ site }: { site: OwnedSite }) {
  const steps = [
    {
      title: "Copy đoạn mã bên dưới",
      detail: "Đoạn mã đã gồm sẵn key của dự án này, không cần sửa gì thêm.",
    },
    {
      title: "Dán vào website, ngay trước thẻ </body>",
      detail:
        "Dán được vào mọi nền tảng: HTML thuần, WordPress (Theme Footer hoặc plugin chèn code), Shopify (theme.liquid), Haravan, Next.js, Vue…",
    },
    {
      title: "Tải lại trang là hộp chat hiện ở góc phải",
      detail:
        originsOf(site).length === 0
          ? "Chưa khai origin nên nhúng ở đâu cũng chạy — đừng quên khai domain thật trước khi chạy chính thức."
          : `Chỉ chạy trên: ${originsOf(site).join(", ")}.`,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <ol className="space-y-2.5 flex-1">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#EA580C] text-white text-[10px] font-semibold grid place-items-center shrink-0 mt-0.5">
                {index + 1}
              </span>
              <div>
                <p className="text-xs font-medium text-[#1D1D1F]">{step.title}</p>
                <p className="text-[11px] text-[#86868B] leading-relaxed">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <CopyButton value={site.embedSnippet} label="Copy mã nhúng" className="shrink-0" />
      </div>

      <pre className="rounded-xl bg-[#1D1D1F] text-[#E8E8ED] text-[11px] leading-relaxed p-3.5 overflow-x-auto font-mono">
        <code>{site.embedSnippet}</code>
      </pre>

      <div className="rounded-xl border border-black/[0.06] p-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-[#86868B]">
          <Lock className="w-3 h-3" />
          Public key
        </span>
        <code className="px-2 py-0.5 rounded-lg bg-neutral-100 border border-neutral-200 text-[11px] font-mono text-[#1D1D1F]">
          {site.publicKey}
        </code>
        <CopyButton value={site.publicKey} label="Copy key" />
        <span className="text-[11px] text-[#86868B] basis-full">
          Key này nằm công khai trong mã nguồn trang — nó không phải mật khẩu, chỉ dùng để xin một
          phiên khách ẩn danh.
        </span>
      </div>
    </div>
  );
}

function ConfigTab({
  site,
  onNotify,
}: {
  site: OwnedSite;
  onNotify: (state: SiteActionState) => void;
}) {
  const [state, formAction, pending] = useActionState(saveSite, {});
  const formState = useSiteFormState(site);
  const hoursState = useOfficeHoursState(site);
  const [previewOutsideHours, setPreviewOutsideHours] = useState(false);
  const router = useRouter();

  // The action revalidates the page; this lifts the message to the page banner
  // and refreshes the project list, where the name and logo also appear.
  useEffect(() => {
    if (state.success || state.error) {
      onNotify(state);
    }

    if (state.success) {
      router.refresh();
    }
  }, [state, onNotify, router]);

  return (
    <form action={formAction} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_15rem] gap-5">
      <div className="space-y-4">
        <input type="hidden" name="id" value={site.id} />
        <SiteFormFields state={formState} />

        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-[#86868B]" />
            <span className="text-xs font-medium text-[#1D1D1F]">Giờ làm việc</span>
          </div>
          <OfficeHoursFields state={hoursState} />
        </div>

        <FormFeedback state={state} />

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-60 transition shadow-xs"
          >
            {pending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Pencil className="w-3.5 h-3.5" />
            )}
            <span>{pending ? "Đang lưu..." : "Lưu thay đổi"}</span>
          </button>
        </div>
      </div>

      <div className="lg:border-l lg:border-black/[0.06] lg:pl-5">
        <div className="lg:sticky lg:top-4">
          <p className="text-[11px] font-medium text-[#86868B] mb-2">Xem trước</p>

          <WidgetPreview
            title={formState.title}
            themeColor={formState.themeColor}
            greeting={formState.greeting}
            imageUrl={formState.image.imageUrl}
            outsideHours={previewOutsideHours}
            offlineMessage={hoursState.offlineMessage}
          />

          {hoursState.enabled && (
            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={previewOutsideHours}
                onChange={(event) => setPreviewOutsideHours(event.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 rounded-sm accent-[#EA580C]"
              />
              <span className="text-[11px] text-[#86868B] leading-relaxed">
                Xem trạng thái ngoài giờ, để không phải chờ tới tối mới biết khách thấy gì.
              </span>
            </label>
          )}
        </div>
      </div>
    </form>
  );
}

function PeopleTab({
  site,
  staff,
  onNotify,
}: {
  site: Site;
  staff: StaffRef[];
  onNotify: (state: SiteActionState) => void;
}) {
  const [members, setMembers] = useState<MemberView[] | null>(null);
  const [pending, setPending] = useState(false);
  const [picked, setPicked] = useState("");
  const router = useRouter();

  const siteId = site.id;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/sites/${siteId}/members`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("members"))))
      .then((data: { members: MemberView[] }) => {
        if (!cancelled) setMembers(data.members);
      })
      .catch(() => {
        if (!cancelled) onNotify({ error: "Không tải được danh sách người phụ trách." });
      });

    return () => {
      cancelled = true;
    };
  }, [siteId, onNotify]);

  const addable = useMemo(() => {
    const taken = new Set((members ?? []).map((member) => member.userId));

    return staff.filter((person) => !taken.has(person.id));
  }, [members, staff]);

  const add = async () => {
    if (!picked) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(`/api/sites/${siteId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: picked }),
      });
      const data = (await response.json()) as { members?: MemberView[]; error?: string };

      if (!response.ok || !data.members) {
        onNotify({ error: data.error ?? "Không thêm được người này." });
        return;
      }

      setMembers(data.members);
      setPicked("");
      onNotify({ success: "Đã thêm. Người này thấy hội thoại của dự án ngay lập tức." });
      // Refreshes the headcount shown on the project list and the tab badge.
      router.refresh();
    } catch {
      onNotify({ error: "Không kết nối được tới máy chủ." });
    } finally {
      setPending(false);
    }
  };

  const remove = async (member: MemberView) => {
    setPending(true);

    try {
      const response = await fetch(`/api/sites/${siteId}/members/${member.userId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { members?: MemberView[]; error?: string };

      if (!response.ok || !data.members) {
        onNotify({ error: data.error ?? "Không bỏ được người này." });
        return;
      }

      setMembers(data.members);
      onNotify({
        success: `Đã thu hồi quyền của ${member.name}. Hộp thư đến của họ ẩn dự án này ngay.`,
      });
      router.refresh();
    } catch {
      onNotify({ error: "Không kết nối được tới máy chủ." });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-[11px] text-[#86868B] leading-relaxed">
        Người được thêm vào đây xem và trả lời được hội thoại của <b>đúng dự án này</b>, nhưng không
        sửa được cấu hình, không xem được key và không thêm được người khác.
      </p>

      {members === null ? (
        <p className="text-xs text-[#86868B]">Đang tải…</p>
      ) : (
        <ul className="divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
          {members.map((member) => (
            <li key={member.userId} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[#F5F5F7] border border-black/[0.04] text-[10px] font-semibold text-[#86868B] grid place-items-center shrink-0">
                  {member.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#1D1D1F] truncate">{member.name}</p>
                  <p className="text-[11px] text-[#86868B] truncate">{member.email ?? "—"}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-lg border ${
                    member.role === "owner"
                      ? "bg-amber-50 text-[#EA580C] border-amber-200"
                      : "bg-neutral-100 text-[#86868B] border-neutral-200"
                  }`}
                >
                  {member.role === "owner" ? "Người tạo dự án" : "Chat & xem"}
                </span>

                {member.role === "manager" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void remove(member)}
                    aria-label={`Thu hồi quyền của ${member.name}`}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1">
          <Select
            size="sm"
            aria-label="Chọn nhân viên để thêm vào dự án"
            options={addable.map((person) => ({
              value: person.id,
              label: person.name,
              hint: person.email,
            }))}
            value={picked}
            onChange={setPicked}
            disabled={pending}
            placeholder="Chọn nhân viên…"
            emptyLabel="Mọi nhân viên đã ở trong dự án"
          />
        </div>

        <button
          type="button"
          disabled={pending || !picked}
          onClick={() => void add()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 disabled:opacity-50 transition shadow-xs shrink-0"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Thêm
        </button>
      </div>

      <p className="text-[11px] text-[#86868B]">
        Chưa thấy ai cần thêm? Tạo tài khoản trước ở{" "}
        <b className="text-[#1D1D1F] font-medium">Quản trị → Quản lý người dùng</b>.
      </p>
    </div>
  );
}

function OperationsTab({
  site,
  busy,
  onToggleActive,
  onRotateKey,
  onDelete,
}: {
  site: OwnedSite;
  busy: boolean;
  onToggleActive: () => void;
  onRotateKey: () => void;
  onDelete: () => void;
}) {
  const rows = [
    {
      title: site.active ? "Widget đang hoạt động" : "Widget đang tắt",
      detail:
        "Tắt widget khiến key không cấp được phiên khách mới. Dùng khi cần tạm dừng kênh mà không phải xóa đoạn mã khỏi website.",
      action: (
        <button
          type="button"
          disabled={busy}
          onClick={onToggleActive}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium border transition shrink-0 disabled:opacity-60 ${
            site.active
              ? "border-neutral-200 bg-white text-[#1D1D1F] hover:border-neutral-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {site.active ? <PowerOff className="w-3 h-3" /> : <Power className="w-3 h-3" />}
          <span>{site.active ? "Tắt widget" : "Bật lại"}</span>
        </button>
      ),
    },
    {
      title: "Cấp lại public key",
      detail:
        "Dùng khi key bị lạm dụng ở website lạ. Sau khi cấp lại phải cập nhật đoạn mã trên website của bạn.",
      action: (
        <button
          type="button"
          disabled={busy}
          onClick={onRotateKey}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-white text-[11px] font-medium text-red-700 hover:bg-red-50 transition shrink-0 disabled:opacity-60"
        >
          <Key className="w-3 h-3" />
          <span>Cấp key mới</span>
        </button>
      ),
    },
    {
      title: "Xóa dự án",
      detail:
        "Dự án bị ẩn khỏi danh sách và widget ngừng hoạt động, thành viên mất quyền ngay. Lịch sử chat và ảnh vẫn được giữ lại.",
      action: (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-200 bg-white text-[11px] font-medium text-red-700 hover:bg-red-50 transition shrink-0 disabled:opacity-60"
        >
          <Trash2 className="w-3 h-3" />
          <span>Xóa dự án</span>
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-2xl divide-y divide-black/[0.05] rounded-xl border border-black/[0.06]">
      {rows.map((row) => (
        <div key={row.title} className="p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-[#1D1D1F]">{row.title}</p>
            <p className="text-[11px] text-[#86868B] leading-relaxed mt-0.5">{row.detail}</p>
          </div>
          {row.action}
        </div>
      ))}

      <div className="px-4 py-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#86868B]">
        <span>
          Tạo lúc <b className="text-[#1D1D1F] font-medium">{formatDateTime(site.createdAt)}</b>
        </span>
        <span>
          Cập nhật <b className="text-[#1D1D1F] font-medium">{formatDateTime(site.updatedAt)}</b>
        </span>
      </div>
    </div>
  );
}

/** What somebody who was merely added to a project sees here. */
function ManagerSiteDetail({ site }: { site: Site }) {
  return (
    <section className="rounded-xl bg-white border border-black/[0.06] shadow-xs p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 grid place-items-center">
          <ShieldAlert className="w-5 h-5" />
        </span>
        {/* A manager cannot change this, but still needs to know whether the box
            is live before wondering why nobody is writing in. */}
        <SiteStatus active={site.active} />
      </div>
      <h2 className="text-sm font-semibold text-[#1D1D1F]">Bạn được thêm vào dự án này</h2>
      <p className="mt-1.5 text-xs text-[#86868B] leading-relaxed max-w-lg">
        Bạn xem và trả lời được hội thoại của <b className="text-[#1D1D1F]">{site.name}</b> trong Hộp
        thư đến. Cấu hình hộp chat, mã nhúng và public key thuộc người tạo dự án, nên không hiển thị
        ở đây.
      </p>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-[#86868B]">
        <span
          className="w-3 h-3 rounded-full border border-black/10"
          style={{ backgroundColor: site.settings.themeColor }}
        />
        <span>{site.settings.title}</span>
      </div>
    </section>
  );
}

function OwnerSiteDetail({
  site,
  staff,
  tab,
  onTabChange,
  onNotify,
  onDelete,
}: {
  site: OwnedSite;
  staff: StaffRef[];
  tab: SiteTab;
  onTabChange: (tab: SiteTab) => void;
  onNotify: (state: SiteActionState) => void;
  onDelete: () => void;
}) {
  const panelId = useId();
  const [rotating, setRotating] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const run = async (action: () => Promise<SiteActionState>) => {
    setBusy(true);

    const result = await action();

    onNotify(result);

    if (result.success) {
      router.refresh();
    }

    setBusy(false);
  };

  return (
    <section className="rounded-xl bg-white border border-black/[0.06] shadow-xs">
      <header className="px-4 pt-3.5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 shrink-0 grid place-items-center overflow-hidden rounded-xl bg-neutral-100 border border-black/[0.04]">
              <SiteImage
                key={site.settings.imageUrl}
                src={site.settings.imageUrl}
                name={site.name}
                className="w-4 h-4"
              />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[#1D1D1F] truncate">{site.name}</h2>
              <p className="text-[11px] text-[#86868B] truncate">
                {site.settings.title} · {originsSummary(site)}
              </p>
            </div>
          </div>

          <SiteStatus active={site.active} />
        </div>

        <div className="border-b border-black/[0.06]">
          <Tabs
            panelId={panelId}
            active={tab}
            onChange={onTabChange}
            items={[
              { key: "embed", label: "Mã nhúng", icon: Code2 },
              { key: "config", label: "Cấu hình", icon: Palette },
              { key: "people", label: "Người phụ trách", icon: Users, badge: site.memberCount },
              { key: "canned", label: "Mẫu câu", icon: Sparkles },
              { key: "operations", label: "Vận hành", icon: Key },
              { key: "telegram", label: "Telegram", icon: Globe },
            ]}
          />
        </div>
      </header>

      <TabPanel id={panelId} className="p-4">
        {tab === "embed" && <EmbedTab site={site} />}
        {tab === "config" && <ConfigTab site={site} onNotify={onNotify} />}
        {tab === "people" && <PeopleTab site={site} staff={staff} onNotify={onNotify} />}
        {tab === "canned" && <CannedTab key={site.id} siteId={site.id} siteName={site.name} />}
        {tab === "telegram" && <TelegramTab key={site.id} siteId={site.id} staff={staff} />}
        {tab === "operations" && (
          <OperationsTab
            site={site}
            busy={busy}
            onToggleActive={() => void run(() => setSiteActive(site.id, !site.active))}
            onRotateKey={() => setRotating(true)}
            onDelete={onDelete}
          />
        )}
      </TabPanel>

      {rotating && (
        <ConfirmDialog
          title="Cấp key mới cho dự án này?"
          icon={<Key className="w-4 h-4" />}
          confirmLabel="Cấp key mới"
          pendingLabel="Đang cấp..."
          pending={busy}
          onClose={() => setRotating(false)}
          onConfirm={() => {
            setRotating(false);
            void run(() => rotateSiteKey(site.id));
          }}
          body={
            <>
              Key hiện tại của <b className="text-[#1D1D1F]">{site.name}</b> sẽ bị vô hiệu ngay. Mọi
              website còn dán đoạn mã cũ sẽ <b>không mở được hội thoại mới</b> cho tới khi bạn cập
              nhật snippet. Hội thoại đang có vẫn được giữ nguyên.
            </>
          }
        />
      )}
    </section>
  );
}

// --- Page -------------------------------------------------------------------

export function SitesClient({
  sites,
  build,
  staff,
}: {
  sites: Site[];
  build: WidgetBuild | null;
  staff: StaffRef[];
}) {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<SiteActionState>({});
  // Held here, not in the detail panel, so switching project keeps the tab —
  // the panel is keyed by project and would otherwise remount.
  const [tab, setTab] = useState<SiteTab>("embed");

  const [contextMenu, setContextMenu] = useState<{ site: Site; x: number; y: number } | null>(null);
  const [deletingSite, setDeletingSite] = useState<OwnedSite | null>(null);
  const [showGlobalCanned, setShowGlobalCanned] = useState(false);
  const [menuPending, startMenuAction] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!notice.error && !notice.success) {
      return;
    }

    const timer = setTimeout(() => setNotice({}), 4000);

    return () => clearTimeout(timer);
  }, [notice]);

  const runMenuAction = (action: () => Promise<SiteActionState>) =>
    startMenuAction(async () => {
      const result = await action();

      setNotice(result);

      if (result.success) {
        setDeletingSite(null);
        router.refresh();
      }
    });

  const openMenuAt = (site: Site, x: number, y: number) => {
    setSelectedId(site.id);
    // Menu clamps itself to the viewport; this is just where the click landed.
    setContextMenu({ site, x, y });
  };

  // Derived rather than synced: the api sorts newest first, so falling back to
  // sites[0] both picks a sensible default and lands on the project just created.
  const selected = sites.find((site) => site.id === selectedId) ?? sites[0] ?? null;

  return (
    <div className="space-y-3">
      <section className="rounded-xl bg-white border border-black/[0.06] shadow-xs p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-50 text-[#EA580C] grid place-items-center shrink-0">
              <Globe className="w-4.5 h-4.5" />
            </span>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-[#1D1D1F]">
                Live Chat Widget
              </h1>
              <p className="text-[11px] text-[#86868B] mt-0.5 max-w-2xl leading-relaxed">
                Mỗi website là một dự án: copy đoạn mã, dán vào trang là chat chạy ngay — không cần
                cài thư viện hay sửa code.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {build ? (
              <span
                title={`Bundle hash ${build.hash}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700"
              >
                <Package className="w-3 h-3" />
                bundle {build.channel} · {formatBytes(build.size)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                <AlertTriangle className="w-3 h-3" />
                Chưa build bundle widget
              </span>
            )}

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 border border-neutral-200 text-[11px] text-[#86868B]">
              <CircleDot className="w-3 h-3" />
              {sites.length} dự án
            </span>

            <button
              type="button"
              onClick={() => setShowGlobalCanned(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 text-[#1D1D1F] text-xs font-medium hover:bg-[#F5F5F7] transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#EA580C]" />
              <span>Mẫu câu chung</span>
            </button>

            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Thêm dự án</span>
            </button>
          </div>
        </div>
      </section>

      {(notice.error || notice.success) && <FormFeedback state={notice} />}

      {sites.length === 0 ? (
        <section className="rounded-xl bg-white border border-black/[0.06] shadow-xs p-10 text-center">
          <span className="w-12 h-12 rounded-full bg-amber-50 text-[#EA580C] grid place-items-center mx-auto mb-3">
            <Globe className="w-6 h-6" />
          </span>
          <h2 className="text-sm font-semibold text-[#1D1D1F]">Chưa có dự án nào</h2>
          <p className="mt-1.5 text-xs text-[#86868B] max-w-md mx-auto leading-relaxed">
            Tạo dự án đầu tiên để nhận public key và đoạn mã nhúng. Mỗi website nên là một dự án
            riêng, như vậy hội thoại trong hộp thư đến biết rõ đến từ đâu.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-white text-xs font-medium hover:from-amber-700 hover:to-orange-700 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo dự án đầu tiên</span>
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] gap-3 items-start">
          <nav
            aria-label="Danh sách dự án"
            className="rounded-xl bg-white border border-black/[0.06] shadow-xs overflow-hidden"
          >
            <p className="px-3 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#86868B]">
              Dự án
            </p>

            <ul className="divide-y divide-black/[0.04]">
              {sites.map((site) => {
                const isSelected = site.id === selected?.id;

                return (
                  <li key={site.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(site.id)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        openMenuAt(site, event.clientX, event.clientY);
                      }}
                      onKeyDown={(event) => {
                        // Shift+F10 and the menu key are the keyboard route to
                        // a context menu.
                        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                          event.preventDefault();
                          const rect = event.currentTarget.getBoundingClientRect();
                          openMenuAt(site, rect.left, rect.bottom);
                        }
                      }}
                      aria-current={isSelected}
                      aria-haspopup="menu"
                      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition border-l-2 ${
                        isSelected
                          ? "border-[#EA580C] bg-amber-50/50"
                          : "border-transparent hover:bg-[#F5F5F7]"
                      }`}
                    >
                      <span className="w-8 h-8 shrink-0 grid place-items-center overflow-hidden rounded-lg bg-neutral-100 border border-black/[0.04]">
                        <SiteImage
                          key={site.settings.imageUrl}
                          src={site.settings.imageUrl}
                          name={site.name}
                          className="w-3.5 h-3.5"
                        />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-[#1D1D1F] truncate flex-1">
                            {site.name}
                          </span>
                          <span aria-hidden="true" className="shrink-0">
                            <StatusDot active={site.active} />
                          </span>
                        </span>
                        <span className="block text-[11px] text-[#86868B] truncate">
                          {site.access === "manager"
                            ? "Bạn được thêm vào"
                            : site.memberCount !== undefined
                              ? `${site.memberCount} người phụ trách`
                              : originsSummary(site)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="p-2 border-t border-black/[0.04]">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-dashed border-neutral-300 text-[11px] font-medium text-[#86868B] hover:text-[#1D1D1F] hover:border-neutral-400 transition"
              >
                <Plus className="w-3 h-3" />
                Thêm dự án
              </button>
            </div>
          </nav>

          {selected &&
            (isOwnedSite(selected) ? (
              <OwnerSiteDetail
                key={selected.id}
                site={selected}
                staff={staff}
                tab={tab}
                onTabChange={setTab}
                onNotify={setNotice}
                onDelete={() => setDeletingSite(selected)}
              />
            ) : (
              <ManagerSiteDetail key={selected.id} site={selected} />
            ))}
        </div>
      )}

      {contextMenu && (
        <Menu
          x={contextMenu.x}
          y={contextMenu.y}
          label={`Tác vụ cho ${contextMenu.site.name}`}
          onClose={() => setContextMenu(null)}
        >
          <MenuHeader
            title={contextMenu.site.name}
            hint={
              <span
                className={`inline-flex items-center gap-1 font-medium ${
                  contextMenu.site.active ? "text-emerald-600" : "text-[#86868B]"
                }`}
              >
                <StatusDot active={contextMenu.site.active} />
                {contextMenu.site.active ? "Đang chạy" : "Đã tắt"}
              </span>
            }
            icon={
              <span className="w-7 h-7 grid place-items-center overflow-hidden rounded-lg bg-neutral-100 border border-black/[0.04]">
                <SiteImage
                  src={contextMenu.site.settings.imageUrl}
                  name={contextMenu.site.name}
                  className="w-3.5 h-3.5"
                />
              </span>
            }
          />

          {isOwnedSite(contextMenu.site) ? (
            <>
              <MenuItem
                icon={Code2}
                label="Copy mã nhúng"
                hint="Dán vào website, trước </body>"
                onClick={() => {
                  const snippet = isOwnedSite(contextMenu.site)
                    ? contextMenu.site.embedSnippet
                    : "";

                  void navigator.clipboard
                    .writeText(snippet)
                    .then(() => setNotice({ success: "Đã copy mã nhúng." }))
                    .catch(() => setNotice({ error: "Không copy được mã nhúng." }));
                  setContextMenu(null);
                }}
              />
              <MenuItem
                icon={Palette}
                label="Mở tab Cấu hình"
                hint="Tiêu đề, màu, logo, giờ làm việc"
                onClick={() => {
                  setTab("config");
                  setContextMenu(null);
                }}
              />
              <MenuItem
                icon={Users}
                label="Người phụ trách"
                hint={
                  contextMenu.site.memberCount !== undefined
                    ? `${contextMenu.site.memberCount} người`
                    : undefined
                }
                onClick={() => {
                  setTab("people");
                  setContextMenu(null);
                }}
              />

              <MenuItem
                icon={Sparkles}
                label="Mẫu câu"
                hint="Bộ mẫu riêng của dự án"
                onClick={() => {
                  setTab("canned");
                  setContextMenu(null);
                }}
              />

              <MenuSeparator />

              <MenuItem
                icon={contextMenu.site.active ? PowerOff : Power}
                label={contextMenu.site.active ? "Tắt widget" : "Bật lại widget"}
                hint={
                  contextMenu.site.active
                    ? "Khách không mở được hội thoại mới"
                    : "Cho khách chat lại"
                }
                disabled={menuPending}
                onClick={() =>
                  runMenuAction(() => setSiteActive(contextMenu.site.id, !contextMenu.site.active))
                }
              />
              <MenuItem
                icon={Trash2}
                label="Xóa dự án"
                hint="Lịch sử chat vẫn được giữ"
                danger
                disabled={menuPending}
                onClick={() => {
                  if (isOwnedSite(contextMenu.site)) {
                    setDeletingSite(contextMenu.site);
                  }
                  setContextMenu(null);
                }}
              />
            </>
          ) : (
            <MenuNote>
              Bạn chỉ được thêm vào dự án này, nên không thay đổi được cấu hình. Vào Hộp thư đến để
              trả lời khách.
            </MenuNote>
          )}
        </Menu>
      )}

      {deletingSite && (
        <ConfirmDialog
          title={`Xóa dự án ${deletingSite.name}?`}
          icon={<Trash2 className="w-4 h-4" />}
          confirmLabel="Xác nhận xóa"
          pendingLabel="Đang xóa..."
          pending={menuPending}
          onClose={() => setDeletingSite(null)}
          onConfirm={() => runMenuAction(() => deleteSite(deletingSite.id))}
          body={
            <>
              Dự án bị ẩn khỏi danh sách và widget ngừng hoạt động, thành viên mất quyền truy cập
              ngay. <b>Lịch sử chat và ảnh vẫn được giữ lại</b>, không xóa vĩnh viễn.
            </>
          }
        />
      )}

      {showGlobalCanned && <GlobalCannedDialog onClose={() => setShowGlobalCanned(false)} />}

      {creating && (
        <CreateSiteModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            // A fresh project is selected by the sites[0] fallback; the embed
            // snippet is the one thing its owner needs next.
            setSelectedId(null);
            setTab("embed");
          }}
        />
      )}
    </div>
  );
}
