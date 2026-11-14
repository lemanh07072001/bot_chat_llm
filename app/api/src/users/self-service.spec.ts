import { BadRequestException, ConflictException } from '@nestjs/common';
import { validate } from 'class-validator';
import * as bcrypt from 'bcryptjs';
import { vi } from 'vitest';
import { UsersController } from './users.controller.js';
import { ChangeOwnPasswordDto, UpdateOwnPreferencesDto, UpdateSelfProfileDto } from './self-service.dto.js';

const actor = { sub: '507f1f77bcf86cd799439011', email: 'agent@example.test', role: 'agent' as const, ver: 0 };

describe('staff self-service', () => {
  const service = { findById: vi.fn(), findByEmailWithPassword: vi.fn(), updateSelf: vi.fn(), changeOwnPassword: vi.fn() };
  const controller = new UsersController(service as never);
  beforeEach(() => vi.resetAllMocks());

  it('allows staff to edit only their own profile without granting roles', async () => {
    service.updateSelf.mockResolvedValue({ toJSON: () => ({ name: 'Agent' }) });
    await controller.updateProfile(actor, { name: ' Agent ', jobTitle: ' Support ', avatarUrl: '' });
    expect(service.updateSelf).toHaveBeenCalledWith(actor.sub, { name: 'Agent', jobTitle: 'Support', avatarUrl: '' });
  });

  it('persists personal templates and preserves an intentionally empty list', async () => {
    service.updateSelf.mockResolvedValue({ toJSON: () => ({}) });
    await controller.updatePreferences(actor, { soundEnabled: false, cannedResponses: [] });
    expect(service.updateSelf).toHaveBeenCalledWith(actor.sub, { soundEnabled: false, cannedResponses: [] });
  });

  it('does not overwrite templates when toggling only sound', async () => {
    service.updateSelf.mockResolvedValue({ toJSON: () => ({}) });
    await controller.updatePreferences(actor, { soundEnabled: false });
    expect(service.updateSelf).toHaveBeenCalledWith(actor.sub, { soundEnabled: false });
  });

  it('rejects wrong current password without writing a new hash', async () => {
    service.findById.mockResolvedValue({ email: actor.email });
    service.findByEmailWithPassword.mockResolvedValue({ passwordHash: await bcrypt.hash('correct-password', 4) });
    await expect(controller.changePassword(actor, { currentPassword: 'wrong', newPassword: 'new-password' })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.changeOwnPassword).not.toHaveBeenCalled();
  });

  it('hashes the new password and requests re-login', async () => {
    const oldHash = await bcrypt.hash('old-password', 4);
    service.findById.mockResolvedValue({ email: actor.email });
    service.findByEmailWithPassword.mockResolvedValue({ passwordHash: oldHash });
    service.changeOwnPassword.mockResolvedValue({});
    expect(await controller.changePassword(actor, { currentPassword: 'old-password', newPassword: 'new-password' })).toEqual({ ok: true, requiresLogin: true });
    const [id, expected, hash] = service.changeOwnPassword.mock.calls[0];
    expect(id).toBe(actor.sub); expect(expected).toBe(oldHash);
    expect(await bcrypt.compare('new-password', hash)).toBe(true);
  });

  it('reports a concurrent password change rather than overwriting it', async () => {
    service.findById.mockResolvedValue({ email: actor.email });
    service.findByEmailWithPassword.mockResolvedValue({ passwordHash: await bcrypt.hash('old-password', 4) });
    service.changeOwnPassword.mockResolvedValue(null);
    await expect(controller.changePassword(actor, { currentPassword: 'old-password', newPassword: 'new-password' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects blank profiles, unsafe avatars, excessive templates and short passwords', async () => {
    expect(await validate(Object.assign(new UpdateSelfProfileDto(), { name: '  ', jobTitle: '', avatarUrl: 'javascript:alert(1)' }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new UpdateOwnPreferencesDto(), { soundEnabled: 'yes', cannedResponses: Array(31).fill(' ') }))).not.toHaveLength(0);
    expect(await validate(Object.assign(new ChangeOwnPasswordDto(), { currentPassword: 'old', newPassword: 'short' }))).not.toHaveLength(0);
  });

  it('rejects privilege fields with the same whitelist validation as HTTP', async () => {
    const dto = Object.assign(new UpdateSelfProfileDto(), { name: 'Agent', jobTitle: '', avatarUrl: '', role: 'admin' });
    expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).some((error) => error.property === 'role')).toBe(true);
  });
});
