import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TodoDependencyDocument = HydratedDocument<TodoDependency>;

@Schema({ timestamps: true })
export class TodoDependency {
  @Prop({ type: Types.ObjectId, ref: 'Todo', required: true })
  prerequisiteId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Todo', required: true })
  dependentId: Types.ObjectId;

  @Prop({ type: Date, default: null })
  deletedAt?: Date | null;
}

export const TodoDependencySchema =
  SchemaFactory.createForClass(TodoDependency);

// unique
TodoDependencySchema.index(
  { prerequisiteId: 1, dependentId: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
  },
);

// dependentId
TodoDependencySchema.index(
  { dependentId: 1 },
  {
    partialFilterExpression: { deletedAt: null },
  },
);
