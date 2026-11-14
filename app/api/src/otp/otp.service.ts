import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { Otp, OtpDocument, OtpPurpose } from './otp.schema.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class OtpService {
  constructor(@InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>) {}

  async generate(userId: string, purpose: OtpPurpose): Promise<string> {
    const existing = await this.otpModel.findOne({ userId, purpose }).sort({ createdAt: -1 }).exec();

    if (existing) {
      const createdAt = (existing as unknown as { createdAt: Date }).createdAt;
      const elapsed = Date.now() - createdAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        throw new HttpException('Please wait before requesting a new code', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    await this.otpModel.deleteMany({ userId, purpose }).exec();

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = this.hashCode(code);

    await this.otpModel.create({
      userId,
      purpose,
      codeHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    return code;
  }

  async verify(userId: string, purpose: OtpPurpose, code: string): Promise<void> {
    // Consume an attempt atomically before comparing, so concurrent guesses
    // cannot exceed MAX_ATTEMPTS.
    const otp = await this.otpModel
      .findOneAndUpdate(
        { userId, purpose, expiresAt: { $gt: new Date() }, attempts: { $lt: MAX_ATTEMPTS } },
        { $inc: { attempts: 1 } },
        { returnDocument: 'after' },
      )
      .exec();

    if (!otp) {
      throw new BadRequestException('Invalid or expired code');
    }

    const providedHash = this.hashCode(code);
    if (!this.safeCompare(otp.codeHash, providedHash)) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.otpModel.deleteOne({ _id: otp._id }).exec();
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'hex');
    const bufferB = Buffer.from(b, 'hex');
    if (bufferA.length !== bufferB.length) {
      return false;
    }
    return timingSafeEqual(bufferA, bufferB);
  }
}
