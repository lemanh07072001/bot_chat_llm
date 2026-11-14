import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { WidgetSettingsDto } from './dto/create-site.dto.js';

describe('widget image settings', () => {
  it('accepts no image, removal, URL and supported raster data', async () => {
    for (const imageUrl of [undefined, '', 'https://example.com/logo.png', 'data:image/png;base64,aGVsbG8=']) {
      expect(await validate(plainToInstance(WidgetSettingsDto, { imageUrl }))).toHaveLength(0);
    }
  });
  it('rejects active protocols, SVG data and oversized values', async () => {
    for (const imageUrl of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'file:///logo.png', 'https://example.com/' + 'a'.repeat(50000)]) {
      expect((await validate(plainToInstance(WidgetSettingsDto, { imageUrl }))).length).toBeGreaterThan(0);
    }
  });
});
