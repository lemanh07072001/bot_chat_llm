import { vi } from 'vitest';
import { UsersService } from './users.service.js';
import { agentProfileOf } from './user.schema.js';
import type { Model } from 'mongoose';
import type { UserDocument } from './user.schema.js';
import type { Site } from '../sites/site.schema.js';

const sites = { exists: vi.fn().mockResolvedValue(null) } as unknown as Model<Site>;

/** The two calls `updateManaged` makes, in the order it makes them. */
function modelFor(currentRole: 'admin' | 'agent') {
  const update = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

  return {
    model: {
      findById: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          lean: vi.fn().mockReturnValue({
            exec: vi.fn().mockResolvedValue({ role: currentRole }),
          }),
        }),
      }),
      findByIdAndUpdate: update,
    } as unknown as Model<UserDocument>,
    update,
  };
}

describe('agentProfileOf', () => {
  it('exposes only what a visitor may see', () => {
    const profile = agentProfileOf({
      _id: 'u1',
      name: 'Lê Mạnh',
      jobTitle: 'Tư vấn viên',
      avatarUrl: 'https://cdn.example.test/a.png',
      // Fields that must never travel with the profile.
      email: 'staff@example.test',
      passwordHash: 'x',
      role: 'admin',
    } as never);

    expect(profile).toEqual({
      id: 'u1',
      name: 'Lê Mạnh',
      jobTitle: 'Tư vấn viên',
      avatarUrl: 'https://cdn.example.test/a.png',
    });
  });

  it('reports a cleared field as absent rather than empty', () => {
    expect(agentProfileOf({ _id: 'u1', name: 'A', jobTitle: '  ', avatarUrl: '' })).toEqual({
      id: 'u1',
      name: 'A',
      jobTitle: null,
      avatarUrl: null,
    });
  });
});

describe('UsersService.updateManaged', () => {
  it('soft deletes accounts and revokes tokens while retaining history', async () => {
    const update = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, sites);
    await service.deleteManaged('u1');
    expect(update).toHaveBeenCalledWith(
      { _id: 'u1', deletedAt: null },
      { $set: { deletedAt: expect.any(Date) }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
  });

  it('blocks deletion of a project owner', async () => {
    const update = vi.fn();
    const ownerSites = { exists: vi.fn().mockResolvedValue({ _id: 'site1' }) } as unknown as Model<Site>;
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, ownerSites);
    await expect(service.deleteManaged('u1')).rejects.toThrow('chuyển quyền sở hữu');
    expect(update).not.toHaveBeenCalled();
  });

  it('excludes deleted accounts from authentication', async () => {
    const exec = vi.fn().mockResolvedValue(null);
    const select = vi.fn().mockReturnValue({ exec, lean: () => ({ exec }) });
    const findOne = vi.fn().mockReturnValue({ select, exec });
    const service = new UsersService({ findOne } as unknown as Model<UserDocument>, sites);
    await service.findById('u1');
    await service.findAuthState('u1');
    await service.findByEmailWithPassword('deleted@example.test');
    expect(findOne).toHaveBeenCalledWith({ _id: 'u1', deletedAt: null });
    expect(findOne).toHaveBeenCalledWith({ email: 'deleted@example.test', deletedAt: null });
  });

  it('invalidates existing tokens with an atomic password compare-and-swap', async () => {
    const update = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, sites);
    await service.changeOwnPassword('u1', 'old-hash', 'new-hash');
    expect(update).toHaveBeenCalledWith({ _id: 'u1', passwordHash: 'old-hash' }, {
      $set: { passwordHash: 'new-hash' }, $inc: { tokenVersion: 1 },
    }, { returnDocument: 'after' });
  });

  it('invalidates tokens when the role changes', async () => {
    const { model, update } = modelFor('agent');

    await new UsersService(model, sites).updateManaged('u1', { name: 'A', role: 'admin' });

    expect(update.mock.calls[0][1]).toMatchObject({ $inc: { tokenVersion: 1 } });
  });

  it('leaves tokens alone when only the profile changes', async () => {
    const { model, update } = modelFor('agent');

    await new UsersService(model, sites).updateManaged('u1', {
      name: 'A',
      role: 'agent',
      jobTitle: 'Tư vấn viên',
    });

    // Signing an agent out mid-conversation because an admin set their avatar
    // would be a regression, not a safety measure.
    expect(update.mock.calls[0][1]).not.toHaveProperty('$inc');
  });
});

describe('UsersService.setAgentStatus', () => {
  it('writes the status on a live account and returns it', async () => {
    const update = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue({ agentStatus: 'busy' }),
    });
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, sites);

    await expect(service.setAgentStatus('507f1f77bcf86cd799440401', 'busy')).resolves.toBe('busy');
    expect(update).toHaveBeenCalledWith(
      { _id: '507f1f77bcf86cd799440401', deletedAt: null },
      { $set: { agentStatus: 'busy' } },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('answers null for a deleted, missing or malformed account', async () => {
    const update = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, sites);

    await expect(service.setAgentStatus('507f1f77bcf86cd799440401', 'away')).resolves.toBeNull();
    await expect(service.setAgentStatus('not-an-id', 'away')).resolves.toBeNull();
    // A malformed id must not even reach the database.
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('reads a document written before the field existed as online', async () => {
    const update = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    const service = new UsersService({ findOneAndUpdate: update } as unknown as Model<UserDocument>, sites);

    await expect(service.setAgentStatus('507f1f77bcf86cd799440401', 'away')).resolves.toBe('online');
  });
});
