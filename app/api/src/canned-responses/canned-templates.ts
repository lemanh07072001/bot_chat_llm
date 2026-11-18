import { BadRequestException } from '@nestjs/common';
import {
  CANNED_MAX_TEMPLATES,
  type CannedTemplate,
} from '../sites/site.schema.js';
import type { CannedTemplateDto } from './canned-responses.dto.js';

/**
 * Trims what an editor sent and refuses a set where two rows answer the same
 * shortcut — a `/gia` that inserts one of two replies at random is a bug the
 * staff cannot debug from the inbox.
 *
 * Pure so both the global/site endpoints and the personal preferences route
 * apply the same rules.
 */
export function normalizeTemplates(
  input: CannedTemplateDto[],
): CannedTemplate[] {
  if (input.length > CANNED_MAX_TEMPLATES) {
    throw new BadRequestException(
      `Chỉ được lưu tối đa ${CANNED_MAX_TEMPLATES} mẫu câu mỗi bộ.`,
    );
  }

  const seen = new Set<string>();

  return input.map((template) => {
    const text = template.text?.trim() ?? '';

    if (!text) {
      throw new BadRequestException('Nội dung mẫu câu không được để trống.');
    }

    const shortcut = template.shortcut?.trim().toLowerCase() ?? '';

    if (shortcut) {
      if (seen.has(shortcut)) {
        throw new BadRequestException(`Phím tắt "/${shortcut}" bị dùng hai lần.`);
      }

      seen.add(shortcut);
    }

    const title = template.title?.trim() ?? '';

    // Optional fields are stored as absent rather than empty, so the admin
    // editor and the picker agree that "no shortcut" means undefined.
    return {
      text,
      ...(title ? { title } : {}),
      ...(shortcut ? { shortcut } : {}),
    } as CannedTemplate;
  });
}
