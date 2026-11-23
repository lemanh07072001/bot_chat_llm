import { ForbiddenException } from '@nestjs/common';
import { vi } from 'vitest';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import type { UsersService } from '../users/users.service.js';
import { TicketsController } from './tickets.controller.js';
import type { TicketsService } from './tickets.service.js';
vi.mock('../users/users.service.js', () => ({ UsersService: class UsersService {} }));
vi.mock('./tickets.service.js', () => ({ TicketsService: class TicketsService {} }));

const payload: JwtPayload = { sub: '507f1f77bcf86cd799439011', email: 'a@example.test', role: 'admin', ver: 0 };

describe('TicketsController', () => {
  const users = { findById: vi.fn() };
  const tickets = { list: vi.fn(), summary: vi.fn(), reply: vi.fn(), assign: vi.fn() };
  const controller = new TicketsController(tickets as unknown as TicketsService, users as unknown as UsersService);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('treats only a verified admin as admin, from the database', async () => {
    users.findById.mockResolvedValue({ role: 'admin', emailVerified: false, name: 'An' });
    await controller.summary(payload);
    expect(tickets.summary).toHaveBeenCalledWith({ userId: payload.sub, isAdmin: false, name: 'An' });

    users.findById.mockResolvedValue({ role: 'admin', emailVerified: true, name: 'An' });
    await controller.list(payload, { status: 'new' });
    expect(tickets.list).toHaveBeenCalledWith({ userId: payload.sub, isAdmin: true, name: 'An' }, { status: 'new' });
  });

  it('passes a null agent through and trims replies', async () => {
    users.findById.mockResolvedValue({ role: 'agent', emailVerified: true, name: 'B' });
    await controller.assign(payload, 't1', { agentId: null });
    expect(tickets.assign).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false }), 't1', null);
    await controller.reply(payload, 't1', { body: '  hi  ' });
    expect(tickets.reply).toHaveBeenCalledWith(expect.objectContaining({ name: 'B' }), 't1', 'hi', undefined);
    await controller.reply(payload, 't1', { attachmentIds: ['507f1f77bcf86cd799439012'] });
    expect(tickets.reply).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'B' }), 't1', '', ['507f1f77bcf86cd799439012']);
  });

  it('rejects a user that no longer exists', async () => {
    users.findById.mockResolvedValue(null);
    await expect(controller.summary(payload)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tickets.summary).not.toHaveBeenCalled();
  });
});
