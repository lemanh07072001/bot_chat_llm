import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { TranslateTextDto } from './translation.dto.js';
import { TranslationService } from './translation.service.js';

@Controller('translation')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  /** Any signed-in member may ask; the answer is only whether the buttons show. */
  @Get('status')
  status() {
    return this.translation.status();
  }

  /**
   * Translating a draft before it is sent. Nothing is stored: the agent decides
   * whether to send the translation, the original, or neither.
   */
  @HttpCode(200)
  @Post('preview')
  preview(@Body() dto: TranslateTextDto) {
    return this.translation.translate(dto);
  }
}
