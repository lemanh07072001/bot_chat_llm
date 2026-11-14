import { ForbiddenException } from '@nestjs/common';
import { vi } from 'vitest';
import { AuthService } from './auth.service.js';
import type { UsersService } from '../users/users.service.js';
import type { OtpService } from '../otp/otp.service.js';
import type { MailService } from '../mail/mail.service.js';
import type { JwtService } from '@nestjs/jwt';

vi.mock('../users/users.service.js', () => ({ UsersService: class UsersService {} }));
vi.mock('../otp/otp.service.js', () => ({ OtpService: class OtpService {} }));
vi.mock('../mail/mail.service.js', () => ({ MailService: class MailService {} }));

const publicUser = { id: '507f1f77bcf86cd799439011', email: 'owner@example.test', role: 'admin' };
const doc = { id: publicUser.id, email: publicUser.email, toJSON: () => publicUser };
const dto = { email: 'Owner@example.test', name: 'Owner', password: 'test-password' };

describe('AuthService registration', () => {
  const users = { count: vi.fn(), create: vi.fn() };
  const otp = { generate: vi.fn() };
  const mail = { sendOtp: vi.fn() };

  const service = new AuthService(
    users as unknown as UsersService,
    {} as unknown as JwtService,
    otp as unknown as OtpService,
    mail as unknown as MailService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    users.create.mockResolvedValue(doc);
    otp.generate.mockResolvedValue('123456');
    mail.sendOtp.mockResolvedValue(undefined);
  });

  it('reports registration open only while the workspace has no accounts', async () => {
    users.count.mockResolvedValue(0);
    expect(await service.registrationState()).toEqual({ open: true });

    users.count.mockResolvedValue(1);
    expect(await service.registrationState()).toEqual({ open: false });
  });

  it('makes the first account an admin and normalizes its email', async () => {
    users.count.mockResolvedValue(0);

    expect(await service.register(dto)).toMatchObject({ user: publicUser });
    expect(users.create.mock.calls[0][0]).toMatchObject({
      email: 'owner@example.test',
      name: 'Owner',
      role: 'admin',
    });
  });

  it('refuses to create a second account through self-registration', async () => {
    users.count.mockResolvedValue(1);

    await expect(service.register(dto)).rejects.toBeInstanceOf(ForbiddenException);
    // Nothing is written and no verification mail goes out on the closed path.
    expect(users.create).not.toHaveBeenCalled();
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('still registers the first admin when the verification mail cannot be sent', async () => {
    users.count.mockResolvedValue(0);
    mail.sendOtp.mockRejectedValue(new Error('smtp down'));

    expect(await service.register(dto)).toMatchObject({ user: publicUser });
  });
});
