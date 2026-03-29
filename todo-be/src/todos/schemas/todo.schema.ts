import { Prop, Schema, SchemaFactory, raw } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Recurrence, RecurrenceUnit, TodoPriority, TodoStatus } from '../types';
import type { RecurrenceConfig } from '../types';

export type TodoDocument = HydratedDocument<Todo>;

@Schema({ timestamps: true })
export class Todo {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop()
  dueDate?: Date;

  @Prop({ enum: TodoStatus, default: TodoStatus.NOT_STARTED })
  status: TodoStatus;

  @Prop({ enum: TodoPriority, default: TodoPriority.LOW })
  priority: TodoPriority;

  @Prop(
    raw({
      type: {
        type: String,
        enum: Object.values(Recurrence),
      },
      interval: {
        type: Number,
        min: 1,
        optional: true,
      },
      unit: {
        type: String,
        enum: Object.values(RecurrenceUnit),
        optional: true,
      },
    }),
  )
  recurrence?: RecurrenceConfig;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const TodoSchema = SchemaFactory.createForClass(Todo);

TodoSchema.index({ name: 'text' });
TodoSchema.index(
  { dueDate: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
TodoSchema.index(
  { priority: 1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
TodoSchema.index(
  { status: 1, dueDate: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
TodoSchema.index(
  { priority: 1, dueDate: -1, _id: -1 },
  { partialFilterExpression: { deletedAt: null } },
);
