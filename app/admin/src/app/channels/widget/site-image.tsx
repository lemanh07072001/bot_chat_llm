"use client";

import { ImageUploadField, RemoteImage, type ImageUploadState } from "@/components/ui";

/**
 * The project's logo, expressed in terms of the shared image pieces.
 *
 * The widget page and the chat-box preview both grew up around these names, so
 * they stay — what moved is the implementation, which the users page now shares
 * for staff avatars.
 */
export { isDisplayableImage, useImageUpload as useSiteImage } from "@/components/ui";

export type SiteImageState = ImageUploadState;

export function SiteImage({
  src,
  name,
  className = "",
}: {
  src?: string;
  name: string;
  className?: string;
}) {
  return <RemoteImage src={src} name={name} className={className} />;
}

export function SiteImageField({ state, name }: { state: SiteImageState; name: string }) {
  return (
    <ImageUploadField
      state={state}
      name={name}
      label="Ảnh / logo dự án"
      hint="Hiện trong danh sách dự án và trên đầu hộp chat. PNG, JPEG hoặc WebP, tối đa 5 MB — ảnh từ máy được thu nhỏ trước khi tải lên. Để trống thì dùng biểu tượng mặc định."
    />
  );
}
