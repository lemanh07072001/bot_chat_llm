import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { User, UserDocument, UserRole } from './user.schema.js';
import { Site } from '../sites/site.schema.js';
import type { CannedTemplate } from '../sites/site.schema.js';

/** The customer-facing half of a staff account, editable on its own. */
export interface StaffProfileInput {
  jobTitle?: string;
  avatarUrl?: string;
}

export interface CreateUserInput extends StaffProfileInput {
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Site.name) private readonly siteModel: Model<Site>,
  ) {}

  async listManaged(): Promise<UserDocument[]> {
    return this.userModel.find({ deletedAt: null }).sort({ createdAt: -1 }).limit(200).exec();
  }

  async deleteManaged(id: string): Promise<UserDocument | null> {
    if (await this.siteModel.exists({ ownerId: id, deletedAt: null })) {
      throw new ConflictException('Người dùng đang sở hữu dự án. Hãy chuyển quyền sở hữu trước khi xóa.');
    }
    // Keep historical message authors and membership references, but revoke login.
    return this.userModel.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { deletedAt: new Date() }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    ).exec();
  }

  async createManaged(input: CreateUserInput): Promise<UserDocument> {
    // Accounts explicitly provisioned by an admin are ready for internal use.
    return this.userModel.create({ ...input, emailVerified: true });
  }

  async updateManaged(
    id: string,
    input: { name: string; role: UserRole } & StaffProfileInput,
  ): Promise<UserDocument | null> {
    const current = await this.userModel.findById(id).select('role').lean().exec();

    if (!current) {
      return null;
    }

    // A role change has to invalidate the tokens that carry the old one.
    // Renaming somebody or giving them an avatar must not: it would sign every
    // agent out of a live conversation every time an admin tidied a profile.
    const invalidate = current.role === input.role ? {} : { $inc: { tokenVersion: 1 } };

    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: input, ...invalidate },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email, deletedAt: null }).select('+passwordHash').exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  async updateSelf(id: string, input: { name: string; jobTitle: string; avatarUrl: string } | { soundEnabled?: boolean; cannedResponses?: string[]; cannedResponseTemplates?: CannedTemplate[]; translationLanguage?: string }) {
    return this.userModel.findByIdAndUpdate(id, { $set: input }, { returnDocument: 'after', runValidators: true }).exec();
  }

  async changeOwnPassword(id: string, expectedHash: string, passwordHash: string) {
    // Compare-and-swap prevents concurrent changes from overwriting each other.
    return this.userModel.findOneAndUpdate({ _id: id, passwordHash: expectedHash }, {
      $set: { passwordHash }, $inc: { tokenVersion: 1 },
    }, { returnDocument: 'after' }).exec();
  }

  /** Batch lookup for labelling assignees without one query per conversation. */
  async findManyByIds(ids: string[]): Promise<UserDocument[]> {
    const valid = ids.filter((id) => isValidObjectId(id));

    if (valid.length === 0) {
      return [];
    }

    return this.userModel.find({ _id: { $in: valid } }).exec();
  }

  async create(input: CreateUserInput): Promise<UserDocument> {
    return this.userModel.create(input);
  }

  async count(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email, deletedAt: null }).exec();
  }

  async markEmailVerified(id: string): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, { emailVerified: true }, { returnDocument: 'after' }).exec();
  }

  async updatePassword(id: string, passwordHash: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { passwordHash, emailVerified: true }, $inc: { tokenVersion: 1 } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  async findAuthState(
    id: string,
  ): Promise<{ _id: unknown; role: UserRole; tokenVersion: number; emailVerified: boolean } | null> {
    return this.userModel.findOne({ _id: id, deletedAt: null }).select('_id role tokenVersion emailVerified').lean().exec();
  }
}
