import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { vi } from 'vitest';
vi.mock('./users.service.js', () => ({ UsersService: class UsersService {} }));

const actor: JwtPayload = { sub: '507f1f77bcf86cd799439011', email: 'admin@example.test', role: 'admin', ver: 0 };
const target = '507f1f77bcf86cd799439012';
const publicUser = { id: target, name: 'Agent', role: 'agent', emailVerified: true };
const doc = { toJSON: () => publicUser };

describe('UsersController', () => {
  const service = { findById: vi.fn(), listManaged: vi.fn(), createManaged: vi.fn(), updateManaged: vi.fn(), deleteManaged: vi.fn() };
  const controller = new UsersController(service as unknown as UsersService);
  beforeEach(() => {
    vi.resetAllMocks();
    service.findById.mockResolvedValue({ role: 'admin', emailVerified: true });
  });
  it('returns serialized users', async () => {
    service.listManaged.mockResolvedValue([doc]);
    expect(await controller.list(actor)).toEqual([publicUser]);
  });
  it('deletes another user', async () => {
    service.deleteManaged.mockResolvedValue(doc);
    expect(await controller.remove(actor, target)).toEqual({ ok: true });
    expect(service.deleteManaged).toHaveBeenCalledWith(target);
  });
  it('blocks self deletion including uppercase object ids', async () => {
    await expect(controller.remove(actor, actor.sub.toUpperCase())).rejects.toBeInstanceOf(BadRequestException);
    expect(service.deleteManaged).not.toHaveBeenCalled();
  });
  it('rejects deletion by non-admins', async () => {
    service.findById.mockResolvedValue({ role: 'agent', emailVerified: true });
    await expect(controller.remove(actor, target)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.deleteManaged).not.toHaveBeenCalled();
  });
  it('rejects invalid and missing deletion targets', async () => {
    await expect(controller.remove(actor, 'invalid')).rejects.toBeInstanceOf(BadRequestException);
    service.deleteManaged.mockResolvedValue(null);
    await expect(controller.remove(actor, target)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('rejects a stale admin claim after database demotion', async () => {
    service.findById.mockResolvedValue({ role: 'agent', emailVerified: true });
    await expect(controller.list(actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.listManaged).not.toHaveBeenCalled();
  });
  it('rejects create and update for non-admins', async () => {
    service.findById.mockResolvedValue({ role: 'agent', emailVerified: true });
    await expect(controller.create(actor, { email: 'agent@example.test', name: 'Agent', password: 'test-password', role: 'agent' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.update(actor, target, { name: 'Agent', role: 'admin' })).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('hashes passwords and normalizes new accounts', async () => {
    service.createManaged.mockResolvedValue(doc);
    expect(await controller.create(actor, { email: 'AGENT@example.test', name: ' Agent ', password: 'test-password', role: 'agent' })).toEqual(publicUser);
    expect(service.createManaged.mock.calls[0][0]).toMatchObject({ email: 'agent@example.test', name: 'Agent', role: 'agent' });
    const hash = service.createManaged.mock.calls[0][0].passwordHash;
    expect(hash).not.toBe('test-password');
    expect(await (await import('bcryptjs')).compare('test-password', hash)).toBe(true);
  });
  it('reports duplicate emails', async () => {
    service.createManaged.mockRejectedValue({ code: 11000 });
    await expect(controller.create(actor, { email: 'agent@example.test', name: 'Agent', password: 'test-password', role: 'agent' })).rejects.toBeInstanceOf(ConflictException);
  });
  it('blocks self-demotion', async () => {
    await expect(controller.update(actor, actor.sub, { name: 'Admin', role: 'agent' })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updateManaged).not.toHaveBeenCalled();
  });
  it('rejects invalid ids and blank names', async () => {
    await expect(controller.update(actor, 'bad-id', { name: 'Agent', role: 'agent' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.update(actor, target, { name: '   ', role: 'agent' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('updates only the editable fields, trimmed', async () => {
    service.updateManaged.mockResolvedValue(doc);
    expect(
      await controller.update(actor, target, {
        name: ' Agent ',
        role: 'agent',
        jobTitle: ' Tu van vien ',
        avatarUrl: ' https://cdn.example.test/a.png ',
      }),
    ).toEqual(publicUser);
    expect(service.updateManaged).toHaveBeenCalledWith(target, {
      name: 'Agent',
      role: 'agent',
      jobTitle: 'Tu van vien',
      avatarUrl: 'https://cdn.example.test/a.png',
    });
  });
  it('clears a profile field that was left out', async () => {
    service.updateManaged.mockResolvedValue(doc);
    await controller.update(actor, target, { name: 'Agent', role: 'agent' });
    // An absent field means "the admin emptied the box", not "leave it alone":
    // the form always posts both, so undefined only happens when cleared.
    expect(service.updateManaged).toHaveBeenCalledWith(target, {
      name: 'Agent',
      role: 'agent',
      jobTitle: '',
      avatarUrl: '',
    });
  });
  it('reports missing users', async () => {
    service.updateManaged.mockResolvedValue(null);
    await expect(controller.update(actor, target, { name: 'Agent', role: 'agent' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
