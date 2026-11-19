import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CannedTemplate, CannedTemplateSchema } from '../sites/site.schema.js';

export type UserDocument = HydratedDocument<User>;

export type UserRole = 'admin' | 'agent';

/** It shares one line with the name inside a 320px wide chat box. */
export const JOB_TITLE_MAX_LENGTH = 60;
export const AVATAR_URL_MAX_LENGTH = 2048;

/**
 * What a visitor is allowed to learn about a member of staff.
 *
 * A whitelist rather than a subtraction: the user document also carries an
 * email, a role, a password hash and a token version, and none of those may
 * ever reach a chat box on somebody else's website.
 */
export interface AgentProfile {
  id: string;
  name: string;
  jobTitle: string | null;
  avatarUrl: string | null;
}

export function agentProfileOf(user: {
  _id: unknown;
  name: string;
  jobTitle?: string;
  avatarUrl?: string;
}): AgentProfile {
  return {
    id: String(user._id),
    name: user.name,
    // Stored as an empty string once an admin clears the field.
    jobTitle: user.jobTitle?.trim() || null,
    avatarUrl: user.avatarUrl?.trim() || null,
  };
}

@Schema({ timestamps: true })
export class User {
  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;

  @Prop({ type: Boolean, default: true })
  soundEnabled!: boolean;

  /**
   * Kept for accounts written before templates carried a title and a shortcut.
   * Read only when `cannedResponseTemplates` is absent; both are shipped so an
   * older client still sees the same texts.
   */
  @Prop({ type: [String], default: undefined })
  cannedResponses?: string[];

  /**
   * The agent's own set. `undefined` means "never chose", which falls back to
   * the built-in starter replies; `[]` means "deliberately empty".
   */
  @Prop({ type: [CannedTemplateSchema], default: undefined })
  cannedResponseTemplates?: CannedTemplate[];

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: String, required: true, enum: ['admin', 'agent'], default: 'agent' })
  role!: UserRole;

  @Prop({ required: true, default: false })
  emailVerified!: boolean;

  @Prop({ required: true, default: 0 })
  tokenVersion!: number;

  /** Shown to visitors next to the name, e.g. "Tư vấn viên". */
  @Prop({ trim: true, maxlength: JOB_TITLE_MAX_LENGTH })
  jobTitle?: string;

  /** Either an http(s) url or a small data url, same shapes as a site image. */
  @Prop({ trim: true, maxlength: AVATAR_URL_MAX_LENGTH })
  avatarUrl?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v, passwordHash: _passwordHash, tokenVersion: _tokenVersion, ...rest } = ret;
    return { id: String(_id), ...rest };
  },
});
