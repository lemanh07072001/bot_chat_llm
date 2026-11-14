import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service.js';
import { UserDocument } from '../users/user.schema.js';
import { OtpService } from '../otp/otp.service.js';
import { MailService } from '../mail/mail.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SendVerifyEmailDto } from './dto/send-verify-email.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { JwtPayload } from './jwt-payload.type.js';

const SALT_ROUNDS = 10;
/** Long enough to open a socket, short enough to be worthless if leaked. */
const WS_TICKET_TTL_SECONDS = 120;
const GENERIC_FORGOT_PASSWORD_MESSAGE = { message: 'If the email exists, a code has been sent' };
const GENERIC_VERIFY_EMAIL_SEND_MESSAGE = {
  message: 'If the email exists and is not verified, a code has been sent',
};

export interface AuthResult {
  accessToken: string;
  user: ReturnType<UserDocument['toJSON']>;
}

export interface RegisterResult {
  message: string;
  user: ReturnType<UserDocument['toJSON']>;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Open on an empty database and closed from the first account onwards, so a
   * fresh install can bootstrap its own admin without a seeding step and the
   * panel does not hand out staff accounts to whoever finds its url. Once this
   * is closed, further staff are created by an admin through /users.
   *
   * There is a race here between the count and the insert: two registrations
   * arriving at the same instant on an empty database could both be made
   * admin. That window only exists before the first account exists, i.e.
   * before anyone has been told the address, so it is left open rather than
   * paid for with a lock.
   */
  async registrationState(): Promise<{ open: boolean }> {
    return { open: (await this.usersService.count()) === 0 };
  }

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = dto.email.toLowerCase();
    const existingUsersCount = await this.usersService.count();

    if (existingUsersCount > 0) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'REGISTRATION_CLOSED',
        message: 'Self-registration is closed; an admin must create your account',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    // The first account owns the workspace.
    const role = 'admin';

    let user: UserDocument;
    try {
      user = await this.usersService.create({
        email,
        name: dto.name,
        passwordHash,
        role,
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }

    try {
      const code = await this.otpService.generate(user.id as string, 'verify_email');
      await this.mailService.sendOtp(user.email, code, 'verify_email');
    } catch (error: unknown) {
      this.logger.error('Failed to send verification email during registration', error as Error);
    }

    return {
      message: 'Registered. A verification code has been sent to your email.',
      user: user.toJSON(),
    };
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmailWithPassword(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email is not verified',
      });
    }

    return this.buildAuthResult(user);
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user) {
      try {
        const code = await this.otpService.generate(user.id as string, 'reset_password');
        await this.mailService.sendOtp(user.email, code, 'reset_password');
      } catch (error: unknown) {
        // Never surface errors here: a different response for existing emails
        // would reveal which emails are registered.
        if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) {
          this.logger.error('Failed to send password reset email', error as Error);
        }
      }
    }

    return GENERIC_FORGOT_PASSWORD_MESSAGE;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid or expired code');
    }

    await this.otpService.verify(user.id as string, 'reset_password', dto.otp);

    const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersService.updatePassword(user.id as string, passwordHash);

    return { message: 'Password has been reset' };
  }

  async sendVerifyEmailOtp(dto: SendVerifyEmailDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (user && !user.emailVerified) {
      try {
        const code = await this.otpService.generate(user.id as string, 'verify_email');
        await this.mailService.sendOtp(user.email, code, 'verify_email');
      } catch (error: unknown) {
        // Never surface errors here: a different response would reveal
        // which emails are registered / already verified.
        if (!(error instanceof HttpException) || error.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) {
          this.logger.error('Failed to send verification email', error as Error);
        }
      }
    }

    return GENERIC_VERIFY_EMAIL_SEND_MESSAGE;
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid or expired code');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email already verified');
    }

    await this.otpService.verify(user.id as string, 'verify_email', dto.otp);
    const updatedUser = await this.usersService.markEmailVerified(user.id as string);

    return this.buildAuthResult(updatedUser ?? user);
  }

  /**
   * The admin panel keeps the session token in an httpOnly cookie, so browser
   * code cannot read it to open a socket. It fetches one of these instead: the
   * same agent claims, but short-lived and only useful for a handshake, so an
   * XSS leak does not hand over a day-long session.
   */
  createWsTicket(currentUser: JwtPayload): { ticket: string; expiresIn: number } {
    const expiresIn = WS_TICKET_TTL_SECONDS;

    const payload: JwtPayload = {
      sub: currentUser.sub,
      email: currentUser.email,
      role: currentUser.role,
      ver: currentUser.ver,
      scope: 'agent',
    };

    return { ticket: this.jwtService.sign(payload, { expiresIn }), expiresIn };
  }

  private buildAuthResult(user: UserDocument): AuthResult {
    const payload: JwtPayload = {
      sub: user.id as string,
      email: user.email,
      role: user.role,
      ver: user.tokenVersion ?? 0,
      scope: 'agent',
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: user.toJSON(),
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000;
  }
}
