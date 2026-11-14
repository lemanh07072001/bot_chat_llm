import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InternalNote } from './internal-note.schema.js';

@Injectable()
export class InternalNotesService {
  constructor(@InjectModel(InternalNote.name) private readonly notes: Model<InternalNote>) {}

  async list(conversationId: string, before?: string) {
    const rows = await this.notes.find({
      conversationId: new Types.ObjectId(conversationId),
      ...(before ? { _id: { $lt: new Types.ObjectId(before) } } : {}),
    }).sort({ _id: -1 }).limit(31).exec();
    const page = rows.slice(0, 30);
    return {
      notes: page.map((note) => note.toJSON()),
      nextCursor: rows.length > 30 ? String(page[page.length - 1]._id) : null,
    };
  }

  async create(conversationId: string, authorId: string, authorName: string, body: string) {
    const note = await this.notes.create({
      conversationId: new Types.ObjectId(conversationId),
      authorId: new Types.ObjectId(authorId), authorName, body,
    });
    return note.toJSON();
  }
}
