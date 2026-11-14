import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Separate collection: visitor message history must never contain staff notes. */
@Schema({ timestamps: true })
export class InternalNote {
  @Prop({ type: Types.ObjectId, required: true })
  conversationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  authorId!: Types.ObjectId;

  @Prop({ required: true, maxlength: 100 })
  authorName!: string;

  @Prop({ required: true, trim: true, maxlength: 4000 })
  body!: string;
}

export const InternalNoteSchema = SchemaFactory.createForClass(InternalNote);
InternalNoteSchema.index({ conversationId: 1, _id: -1 });
InternalNoteSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { _id, __v: _version, conversationId, authorId, ...rest } = ret;
    return { ...rest, id: String(_id), conversationId: String(conversationId), authorId: String(authorId) };
  },
});
