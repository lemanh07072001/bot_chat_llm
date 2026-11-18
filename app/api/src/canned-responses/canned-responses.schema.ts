import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CannedTemplate, CannedTemplateSchema } from '../sites/site.schema.js';

export type GlobalCannedResponseSetDocument =
  HydratedDocument<GlobalCannedResponseSet>;

/**
 * The one set every project may use.
 *
 * Stored in its own collection instead of a document on User or Site: it
 * belongs to the installation, an admin edits it, and everybody else is only
 * allowed to read it. The unique `scope` index is what makes "create it once"
 * safe when two admins press Save at the same moment.
 */
@Schema({ timestamps: true, collection: 'canned_response_sets' })
export class GlobalCannedResponseSet {
  @Prop({ required: true, unique: true, enum: ['global'], default: 'global' })
  scope!: 'global';

  @Prop({ type: [CannedTemplateSchema], default: [] })
  templates!: CannedTemplate[];

  /** Compare-and-swap counter; see SitesService.updateCannedResponses. */
  @Prop({ required: true, default: 0 })
  version!: number;
}

export const GlobalCannedResponseSetSchema = SchemaFactory.createForClass(
  GlobalCannedResponseSet,
);
