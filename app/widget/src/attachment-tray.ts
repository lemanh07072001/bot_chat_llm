import { checkImage, checkPrepared, MAX_IMAGES, prepareImage } from './images.js';
import type { AttachmentView } from './types.js';

/** Server reply when an id was already claimed (e.g. the ack timed out after save). */
export const ATTACHMENT_CLAIMED_ERROR = 'Ảnh không hợp lệ hoặc đã được dùng.';

export const ATTACHMENT_LABELS = {
  attach: 'Đính kèm ảnh',
  remove: 'Bỏ ảnh này',
  retry: 'Bấm để tải lại',
  tooMany: 'Tối đa 5 ảnh mỗi lần gửi.',
  tooLarge: 'Ảnh vượt quá 10MB.',
  badType: 'Chỉ gửi được ảnh JPG, PNG, WebP hoặc GIF.',
  failed: 'Không tải được ảnh, thử lại.',
  rateLimited: 'Bạn đã tải quá nhiều ảnh, vui lòng thử lại sau ít phút.',
  uploading: 'Đang tải ảnh…',
  alt: 'Ảnh đính kèm',
};

export type UploadFn = (
  file: Blob,
  meta: { name?: string; width?: number; height?: number },
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) => Promise<AttachmentView>;

type ItemState = 'uploading' | 'done' | 'error';

interface TrayItem {
  file: File;
  objectUrl: string;
  state: ItemState;
  attachment: AttachmentView | null;
  el: HTMLDivElement;
  bar: HTMLDivElement;
  /** Bumped on remove so a late upload result is ignored. */
  removed: boolean;
  /** Aborts the upload in flight (remove / destroy). */
  controller: AbortController | null;
}

/** One decode/encode at a time across all trays: keeps memory flat on phones. */
let prepareChain: Promise<unknown> = Promise.resolve();

function queuePrepare<T>(task: () => Promise<T>): Promise<T> {
  const run = prepareChain.then(task, task);

  prepareChain = run.catch(() => undefined);

  return run;
}

/**
 * Pending images above a composer: thumbnails with progress, an error state
 * (click to retry) and a remove button. Each file is uploaded as soon as it is
 * picked, so sending only has to pass the ids along.
 */
export class AttachmentTray {
  readonly element: HTMLDivElement;
  private readonly items: TrayItem[] = [];
  private disabled = false;
  private readonly upload: UploadFn;
  private readonly onChange: () => void;
  private readonly onError: (text: string) => void;

  constructor(upload: UploadFn, onChange: () => void, onError: (text: string) => void) {
    this.upload = upload;
    this.onChange = onChange;
    this.onError = onError;
    this.element = document.createElement('div');
    this.element.className = 'attach-tray';
    this.element.hidden = true;
  }

  get isUploading(): boolean {
    return this.items.some((item) => item.state === 'uploading');
  }

  get readyIds(): string[] {
    return this.items
      .filter((item) => item.state === 'done' && item.attachment)
      .map((item) => (item.attachment as AttachmentView).id);
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = disabled;
    }
  }

  addFiles(files: Iterable<File>): void {
    if (this.disabled) return;

    for (const file of files) {
      const problem = checkImage(file);

      if (problem) {
        this.onError(problem === 'TYPE' ? ATTACHMENT_LABELS.badType : ATTACHMENT_LABELS.tooLarge);
        continue;
      }

      if (this.items.length >= MAX_IMAGES) {
        this.onError(ATTACHMENT_LABELS.tooMany);
        break;
      }

      this.addItem(file);
    }

    this.onChange();
  }

  /** Drops the items whose upload was just sent; failed ones stay for a retry. */
  clearSent(ids: string[]): void {
    const sent = new Set(ids);

    for (const item of [...this.items]) {
      if (item.attachment && sent.has(item.attachment.id)) {
        this.removeItem(item);
      }
    }

    this.onChange();
  }

  clear(): void {
    for (const item of [...this.items]) this.removeItem(item);
    this.onChange();
  }

  private addItem(file: File): void {
    const objectUrl = URL.createObjectURL(file);
    const el = document.createElement('div');
    el.className = 'attach-item';

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'attach-thumb';
    thumb.disabled = this.disabled;

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = ATTACHMENT_LABELS.alt;
    thumb.append(img);

    const spinner = document.createElement('span');
    spinner.className = 'attach-spinner';
    spinner.setAttribute('aria-hidden', 'true');

    const progress = document.createElement('div');
    progress.className = 'attach-progress';
    const bar = document.createElement('div');
    bar.className = 'attach-progress-bar';
    progress.append(bar);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'attach-remove';
    remove.setAttribute('aria-label', ATTACHMENT_LABELS.remove);
    remove.title = ATTACHMENT_LABELS.remove;
    remove.textContent = '×';
    remove.disabled = this.disabled;

    el.append(thumb, spinner, progress, remove);

    const item: TrayItem = {
      file,
      objectUrl,
      state: 'uploading',
      attachment: null,
      el,
      bar,
      removed: false,
      controller: null,
    };

    remove.addEventListener('click', () => {
      this.removeItem(item);
      this.onChange();
    });
    thumb.addEventListener('click', () => {
      if (item.state === 'error') void this.start(item);
    });

    this.items.push(item);
    this.element.append(el);
    this.element.hidden = false;
    void this.start(item);
  }

  private paint(item: TrayItem): void {
    item.el.dataset.state = item.state;
    const thumb = item.el.querySelector<HTMLButtonElement>('.attach-thumb');

    if (thumb) {
      thumb.title = item.state === 'error' ? `${ATTACHMENT_LABELS.failed} ${ATTACHMENT_LABELS.retry}` : '';
      thumb.setAttribute(
        'aria-label',
        item.state === 'error'
          ? `${ATTACHMENT_LABELS.failed} ${ATTACHMENT_LABELS.retry}`
          : item.state === 'uploading'
            ? ATTACHMENT_LABELS.uploading
            : ATTACHMENT_LABELS.alt,
      );
    }
  }

  private async start(item: TrayItem): Promise<void> {
    item.state = 'uploading';
    item.bar.style.width = '0%';
    this.paint(item);
    this.onChange();

    const controller = new AbortController();

    item.controller = controller;

    try {
      const prepared = await queuePrepare(() =>
        item.removed ? Promise.resolve(null) : prepareImage(item.file, item.file.name),
      );

      if (item.removed || !prepared) return;

      if (checkPrepared(prepared)) {
        this.onError(ATTACHMENT_LABELS.tooLarge);
        this.removeItem(item);
        this.onChange();
        return;
      }

      const attachment = await this.upload(
        prepared.blob,
        { name: prepared.name, width: prepared.width, height: prepared.height },
        (fraction) => {
          if (!item.removed) item.bar.style.width = `${Math.round(fraction * 100)}%`;
        },
        controller.signal,
      );

      if (item.removed) return;

      item.attachment = attachment;
      item.state = 'done';
    } catch (error) {
      if (item.removed) return;

      const code = error instanceof Error ? error.message : '';
      item.state = 'error';
      this.onError(
        code === 'RATE_LIMITED'
          ? ATTACHMENT_LABELS.rateLimited
          : code === 'TOO_LARGE'
            ? ATTACHMENT_LABELS.tooLarge
            : ATTACHMENT_LABELS.failed,
      );
    }

    this.paint(item);
    this.onChange();
  }

  private removeItem(item: TrayItem): void {
    item.removed = true;
    item.controller?.abort();
    item.controller = null;
    URL.revokeObjectURL(item.objectUrl);
    item.el.remove();

    const index = this.items.indexOf(item);
    if (index >= 0) this.items.splice(index, 1);

    this.element.hidden = this.items.length === 0;
  }
}
