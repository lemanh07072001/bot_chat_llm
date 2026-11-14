import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthResult, RegisterResult } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SendVerifyEmailDto } from './dto/send-verify-email.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { Public } from './public.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import type { JwtPayload } from './jwt-payload.type.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Lets the sign-in screens tell whether the workspace still needs its first
   * admin, instead of offering a form that can only fail. It leaks nothing a
   * single registration attempt would not.
   */
  @Public()
  @Get('registration')
  async registration(): Promise<{ open: boolean }> {
    return this.authService.registrationState();
  }

  /** Only serves the first account; afterwards an admin creates staff via /users. */
  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<RegisterResult> {
    return this.authService.register(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Get('me')
  async me(@CurrentUser() currentUser: JwtPayload) {
    const user = await this.usersService.findById(currentUser.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user.toJSON();
  }

  /** Short-lived ticket the admin panel uses to open its realtime socket. */
  @HttpCode(200)
  @Post('ws-ticket')
  wsTicket(@CurrentUser() currentUser: JwtPayload) {
    return this.authService.createWsTicket(currentUser);
  }

  @Public()
  @HttpCode(200)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email/send')
  async sendVerifyEmailOtp(@Body() dto: SendVerifyEmailDto) {
    return this.authService.sendVerifyEmailOtp(dto);
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<AuthResult> {
    return this.authService.verifyEmail(dto);
  }
}
