import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, PipelineStage, Types } from 'mongoose';
import { CreateTodoDto } from './dto/create-todo.dto';
import { SearchTodoDto, SortOrder } from './dto/search-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Todo } from './schemas/todo.schema';
import { TodoDependency } from './schemas/todo-dependency.schema';
import {
  DependencyStatus,
  Recurrence,
  RecurrenceConfig,
  RecurrenceUnit,
  TodoStatus,
} from './types';

@Injectable()
export class TodosService {
  constructor(
    @InjectModel(Todo.name) private todoModel: Model<Todo>,
    @InjectModel(TodoDependency.name)
    private todoDependencyModel: Model<TodoDependency>,
  ) {}

  async create(createTodoDto: CreateTodoDto): Promise<Todo> {
    this.assertDueDateForRecurrence(createTodoDto);
    const payload = this.buildTodoPayload(createTodoDto);
    return this.todoModel.create(payload);
  }

  async findOne(id: string): Promise<Todo | null> {
    return this.todoModel.findOne({ _id: id, deletedAt: null }).exec();
  }

  async search(query: SearchTodoDto) {
    const {
      name,
      dueDateStart,
      dueDateEnd,
      status,
      priority,
      dependencyStatus,
      sortBy,
      sortOrder,
      page,
      limit,
    } = query;

    const filter: Record<string, unknown> = { deletedAt: null };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (name?.trim()) filter.name = { $regex: name.trim(), $options: 'i' };

    if (dueDateStart || dueDateEnd) {
      const dueFilter: Record<string, Date> = {};
      if (dueDateStart) dueFilter.$gte = new Date(dueDateStart);
      if (dueDateEnd) dueFilter.$lte = new Date(dueDateEnd);
      if (Object.keys(dueFilter).length > 0) filter.dueDate = dueFilter;
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === SortOrder.ASC ? 1 : -1,
      _id: -1,
    };
    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $lookup: {
          from: this.todoDependencyModel.collection.name,
          let: { todoId: '$_id' },
          pipeline: [
            {
              $match: {
                deletedAt: null,
                $expr: {
                  $eq: ['$dependentId', '$$todoId'],
                },
              },
            },
            {
              $project: {
                _id: 0,
                prerequisiteId: 1,
              },
            },
          ],
          as: 'dependencyEdges',
        },
      },
      {
        $lookup: {
          from: this.todoModel.collection.name,
          let: { prerequisiteIds: '$dependencyEdges.prerequisiteId' },
          pipeline: [
            {
              $match: {
                deletedAt: null,
                status: {
                  $in: [TodoStatus.NOT_STARTED, TodoStatus.IN_PROGRESS],
                },
                $expr: {
                  $in: ['$_id', '$$prerequisiteIds'],
                },
              },
            },
            {
              $project: {
                _id: 1,
              },
            },
          ],
          as: 'blockingPrerequisites',
        },
      },
      {
        $addFields: {
          dependencyStatus: {
            $cond: [
              {
                $gt: [{ $size: '$blockingPrerequisites' }, 0],
              },
              DependencyStatus.BLOCKED,
              DependencyStatus.UNBLOCKED,
            ],
          },
        },
      },
    ];

    if (dependencyStatus) {
      pipeline.push({
        $match: {
          dependencyStatus,
        },
      });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        results: [
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              dependencyEdges: 0,
              blockingPrerequisites: 0,
            },
          },
        ],
      },
    });

    type SearchTodoAggregationResult = {
      metadata: Array<{ total: number }>;
      results: Array<Todo & { dependencyStatus: DependencyStatus }>;
    };

    const [aggregationResult] = await this.todoModel
      .aggregate<SearchTodoAggregationResult>(pipeline)
      .exec();
    const total = aggregationResult?.metadata?.[0]?.total ?? 0;
    const results = aggregationResult?.results ?? [];

    return {
      total,
      page,
      limit,
      results,
    };
  }

  async update(id: string, updateTodoDto: UpdateTodoDto): Promise<Todo | null> {
    const session = await this.todoModel.db.startSession();
    session.startTransaction();

    try {
      const existing = await this.todoModel
        .findOne({ _id: id, deletedAt: null })
        .session(session)
        .exec();
      if (!existing) {
        await session.abortTransaction();
        return null;
      }

      const nextStatus = updateTodoDto.status ?? existing.status;
      const nextDueDate =
        updateTodoDto.dueDate === undefined
          ? existing.dueDate
          : updateTodoDto.dueDate;
      const nextRecurrence =
        updateTodoDto.recurrence === undefined
          ? existing.recurrence
          : updateTodoDto.recurrence;

      this.assertDueDateForRecurrence({
        dueDate: nextDueDate ?? undefined,
        recurrence: nextRecurrence ?? undefined,
      });

      if (
        existing.status !== TodoStatus.IN_PROGRESS &&
        nextStatus === TodoStatus.IN_PROGRESS
      ) {
        await this.ensureDependenciesReadyForInProgress(id, session);
      }

      const updatePayload = this.buildUpdatePayload(updateTodoDto);

      const updated = await this.todoModel
        .findOneAndUpdate({ _id: id, deletedAt: null }, updatePayload, {
          returnDocument: 'after',
          session,
        })
        .exec();

      if (!updated) {
        await session.abortTransaction();
        return null;
      }

      await this.createNextRecurringTodoIfNeeded(
        id,
        existing,
        updated,
        session,
      );

      await session.commitTransaction();
      return updated;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async remove(id: string): Promise<Todo | null> {
    const session: ClientSession = await this.todoModel.db.startSession();
    session.startTransaction();

    try {
      const todoObjectId = new Types.ObjectId(id);
      const todo = await this.todoModel
        .findOne({ _id: id, deletedAt: null })
        .session(session)
        .exec();

      if (!todo) {
        await session.abortTransaction();
        return null;
      }

      const now = new Date();
      await this.todoModel
        .updateOne(
          { _id: id, deletedAt: null },
          { $set: { deletedAt: now } },
          { session },
        )
        .exec();

      await this.todoDependencyModel
        .updateMany(
          {
            deletedAt: null,
            $or: [
              { prerequisiteId: todoObjectId },
              { dependentId: todoObjectId },
            ],
          },
          { $set: { deletedAt: now } },
          { session },
        )
        .exec();

      await session.commitTransaction();
      return todo;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async addDependencies(dependentId: string, prerequisiteIds: string[]) {
    if (prerequisiteIds.length === 0) {
      return { dependentId, created: 0 };
    }

    const session = await this.todoModel.db.startSession();
    session.startTransaction();

    try {
      const dependentTodo = await this.todoModel
        .findOne({ _id: dependentId, deletedAt: null })
        .session(session)
        .lean()
        .exec();
      if (!dependentTodo) {
        throw new NotFoundException(`Todo with id ${dependentId} not found`);
      }

      const uniquePrerequisiteIds = [...new Set(prerequisiteIds)];
      const dependentObjectId = new Types.ObjectId(dependentId);
      const prerequisiteObjectIds = uniquePrerequisiteIds.map(
        (id) => new Types.ObjectId(id),
      );
      if (uniquePrerequisiteIds.some((id) => id === dependentId)) {
        throw new BadRequestException('Todo cannot depend on itself');
      }

      const prerequisites = await this.todoModel
        .find({ _id: { $in: uniquePrerequisiteIds }, deletedAt: null })
        .session(session)
        .lean()
        .exec();
      const foundIds = new Set(prerequisites.map((item) => String(item._id)));
      const missingIds = uniquePrerequisiteIds.filter(
        (id) => !foundIds.has(id),
      );
      if (missingIds.length > 0) {
        throw new NotFoundException(
          `Prerequisite todo(s) not found: ${missingIds.join(', ')}`,
        );
      }

      const cyclePrerequisiteIds = await this.findCyclePrerequisiteIds(
        uniquePrerequisiteIds,
        dependentId,
        session,
      );

      if (cyclePrerequisiteIds.length > 0) {
        const prerequisiteNameMap = new Map(
          prerequisites.map((item) => [String(item._id), item.name]),
        );
        const cycleLabels = cyclePrerequisiteIds.map(
          (id) => prerequisiteNameMap.get(id) ?? id,
        );
        throw new BadRequestException(
          `Adding edge(s) ${cycleLabels.join(', ')} -> ${dependentTodo.name ?? dependentId} introduces a cycle`,
        );
      }

      const existingEdges = await this.todoDependencyModel
        .find({
          prerequisiteId: { $in: prerequisiteObjectIds },
          dependentId: dependentObjectId,
          deletedAt: null,
        })
        .session(session)
        .lean()
        .exec();
      const existingPrerequisiteSet = new Set(
        existingEdges.map((edge) => String(edge.prerequisiteId)),
      );

      const toCreate = uniquePrerequisiteIds
        .map((id, index) => ({
          id,
          objectId: prerequisiteObjectIds[index],
        }))
        .filter(({ id }) => !existingPrerequisiteSet.has(id))
        .map(({ objectId }) => ({
          prerequisiteId: objectId,
          dependentId: dependentObjectId,
        }));

      if (toCreate.length > 0) {
        try {
          await this.todoDependencyModel.insertMany(toCreate, { session });
        } catch (error) {
          if (this.isDuplicateKeyError(error)) {
            await session.commitTransaction();
            return {
              dependentId,
              created: 0,
            };
          }
          throw error;
        }
      }

      await session.commitTransaction();
      return {
        dependentId,
        created: toCreate.length,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async removeDependencies(dependentId: string, prerequisiteIds: string[]) {
    const session = await this.todoModel.db.startSession();
    session.startTransaction();

    try {
      const uniquePrerequisiteIds = [...new Set(prerequisiteIds)];
      const dependentObjectId = new Types.ObjectId(dependentId);
      const prerequisiteObjectIds = uniquePrerequisiteIds.map(
        (id) => new Types.ObjectId(id),
      );
      if (uniquePrerequisiteIds.length === 0) {
        await session.commitTransaction();
        return {
          dependentId,
          removed: 0,
        };
      }

      const result = await this.todoDependencyModel
        .updateMany(
          {
            dependentId: dependentObjectId,
            prerequisiteId: { $in: prerequisiteObjectIds },
            deletedAt: null,
          },
          {
            $set: { deletedAt: new Date() },
          },
          { session },
        )
        .exec();

      await session.commitTransaction();
      return {
        dependentId,
        removed: result.modifiedCount ?? 0,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async listDependencies(id: string) {
    const todoObjectId = new Types.ObjectId(id);
    const edges = await this.todoDependencyModel
      .find({ dependentId: todoObjectId, deletedAt: null })
      .lean()
      .exec();
    const prerequisiteIds = [
      ...new Set(edges.map((edge) => String(edge.prerequisiteId))),
    ];
    if (prerequisiteIds.length === 0) {
      return [];
    }
    return this.todoModel
      .find({ _id: { $in: prerequisiteIds }, deletedAt: null })
      .lean()
      .exec();
  }

  async listDependents(id: string) {
    const todoObjectId = new Types.ObjectId(id);
    const edges = await this.todoDependencyModel
      .find({ prerequisiteId: todoObjectId, deletedAt: null })
      .lean()
      .exec();
    const dependentIds = [
      ...new Set(edges.map((edge) => String(edge.dependentId))),
    ];
    if (dependentIds.length === 0) {
      return [];
    }
    return this.todoModel
      .find({ _id: { $in: dependentIds }, deletedAt: null })
      .lean()
      .exec();
  }

  async getSubgraph(id: string) {
    const todoObjectId = new Types.ObjectId(id);

    type SubgraphAggregationResult = {
      nodeIds: Types.ObjectId[];
      upstreamEdges: Array<
        Pick<TodoDependency, 'prerequisiteId' | 'dependentId'>
      >;
      downstreamEdges: Array<
        Pick<TodoDependency, 'prerequisiteId' | 'dependentId'>
      >;
    };

    const [graphResult] = await this.todoModel
      .aggregate<SubgraphAggregationResult>([
        {
          $match: {
            _id: todoObjectId,
            deletedAt: null,
          },
        },
        {
          $graphLookup: {
            from: this.todoDependencyModel.collection.name,
            startWith: '$_id',
            connectFromField: 'prerequisiteId',
            connectToField: 'dependentId',
            as: 'upstreamEdges',
            restrictSearchWithMatch: {
              deletedAt: null,
            },
          },
        },
        {
          $graphLookup: {
            from: this.todoDependencyModel.collection.name,
            startWith: '$_id',
            connectFromField: 'dependentId',
            connectToField: 'prerequisiteId',
            as: 'downstreamEdges',
            restrictSearchWithMatch: {
              deletedAt: null,
            },
          },
        },
        {
          $project: {
            nodeIds: {
              $setUnion: [
                ['$_id'],
                {
                  $map: {
                    input: '$upstreamEdges',
                    as: 'edge',
                    in: '$$edge.prerequisiteId',
                  },
                },
                {
                  $map: {
                    input: '$upstreamEdges',
                    as: 'edge',
                    in: '$$edge.dependentId',
                  },
                },
                {
                  $map: {
                    input: '$downstreamEdges',
                    as: 'edge',
                    in: '$$edge.prerequisiteId',
                  },
                },
                {
                  $map: {
                    input: '$downstreamEdges',
                    as: 'edge',
                    in: '$$edge.dependentId',
                  },
                },
              ],
            },
            upstreamEdges: {
              $map: {
                input: '$upstreamEdges',
                as: 'edge',
                in: {
                  prerequisiteId: '$$edge.prerequisiteId',
                  dependentId: '$$edge.dependentId',
                },
              },
            },
            downstreamEdges: {
              $map: {
                input: '$downstreamEdges',
                as: 'edge',
                in: {
                  prerequisiteId: '$$edge.prerequisiteId',
                  dependentId: '$$edge.dependentId',
                },
              },
            },
          },
        },
      ])
      .exec();

    if (!graphResult) {
      return null;
    }

    const edgeKeySet = new Set<string>();
    const edges = [
      ...graphResult.upstreamEdges,
      ...graphResult.downstreamEdges,
    ].filter((edge) => {
      const edgeKey = `${String(edge.prerequisiteId)}:${String(edge.dependentId)}`;
      if (edgeKeySet.has(edgeKey)) {
        return false;
      }
      edgeKeySet.add(edgeKey);
      return true;
    });

    const nodes = await this.todoModel
      .find({ _id: { $in: graphResult.nodeIds }, deletedAt: null })
      .lean()
      .exec();

    return {
      rootId: id,
      nodes,
      edges: edges.map((edge) => ({
        prerequisiteId: String(edge.prerequisiteId),
        dependentId: String(edge.dependentId),
      })),
    };
  }

  private async findCyclePrerequisiteIds(
    prerequisiteIds: string[],
    dependentId: string,
    session: ClientSession,
  ): Promise<string[]> {
    if (prerequisiteIds.length === 0) {
      return [];
    }

    const dependentObjectId = new Types.ObjectId(dependentId);

    const [result] = await this.todoModel
      .aggregate<{ reachableDependentIds: Types.ObjectId[] }>([
        {
          $match: {
            _id: dependentObjectId,
            deletedAt: null,
          },
        },
        {
          $graphLookup: {
            from: this.todoDependencyModel.collection.name,
            startWith: '$_id',
            connectFromField: 'dependentId',
            connectToField: 'prerequisiteId',
            as: 'reachableDependencyEdges',
            restrictSearchWithMatch: {
              deletedAt: null,
            },
          },
        },
        {
          $project: {
            reachableDependentIds: '$reachableDependencyEdges.dependentId',
          },
        },
      ])
      .session(session)
      .exec();

    const reachableDependentIdSet = new Set(
      (result?.reachableDependentIds ?? []).map((id) => String(id)),
    );

    return prerequisiteIds.filter(
      (prerequisiteId) =>
        prerequisiteId === dependentId ||
        reachableDependentIdSet.has(prerequisiteId),
    );
  }

  private getNextDueDate(baseDate: Date, recurrence: RecurrenceConfig): Date {
    const next = new Date(baseDate);
    switch (recurrence.type) {
      case Recurrence.DAILY:
        next.setDate(next.getDate() + 1);
        return next;
      case Recurrence.WEEKLY:
        next.setDate(next.getDate() + 7);
        return next;
      case Recurrence.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        return next;
      case Recurrence.CUSTOM:
        return this.addCustomInterval(next, recurrence);
      default:
        return next;
    }
  }

  private normalizeRecurrence(recurrence: RecurrenceConfig): RecurrenceConfig {
    if (recurrence.type !== Recurrence.CUSTOM) {
      return {
        type: recurrence.type,
      };
    }

    if (!recurrence.interval || !recurrence.unit) {
      throw new BadRequestException(
        'Custom recurrence requires both interval and unit',
      );
    }

    return {
      type: recurrence.type,
      interval: recurrence.interval,
      unit: recurrence.unit,
    };
  }

  private addCustomInterval(date: Date, recurrence: RecurrenceConfig): Date {
    if (!recurrence.interval) {
      throw new BadRequestException(
        'Custom recurrence requires a valid interval',
      );
    }

    const interval = recurrence.interval;

    switch (recurrence.unit) {
      case RecurrenceUnit.WEEK:
        date.setDate(date.getDate() + interval * 7);
        return date;
      case RecurrenceUnit.MONTH:
        date.setMonth(date.getMonth() + interval);
        return date;
      case RecurrenceUnit.DAY:
      default:
        date.setDate(date.getDate() + interval);
        return date;
    }
  }

  private buildTodoPayload(todo: {
    name: string;
    description?: string;
    dueDate?: string | Date;
    priority?: Todo['priority'];
    recurrence?: RecurrenceConfig;
    status?: Todo['status'];
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = { ...todo };

    if (todo.recurrence) {
      payload.recurrence = this.normalizeRecurrence(todo.recurrence);
    } else {
      delete payload.recurrence;
    }

    return payload;
  }

  private assertDueDateForRecurrence(todo: {
    dueDate?: string | Date;
    recurrence?: RecurrenceConfig;
  }): void {
    if (todo.recurrence && !todo.dueDate) {
      throw new BadRequestException(
        'Due date is required when recurrence is provided',
      );
    }
  }

  private buildUpdatePayload(
    updateTodoDto: UpdateTodoDto,
  ): Record<string, unknown> {
    const nullableFields = ['description', 'dueDate', 'recurrence'] as const;
    const setPayload = Object.fromEntries(
      Object.entries(updateTodoDto).filter(
        ([key, value]) =>
          value !== undefined &&
          value !== null &&
          !nullableFields.includes(key as (typeof nullableFields)[number]),
      ),
    );
    const unsetPayload: Record<string, 1> = {};

    for (const field of nullableFields) {
      const value = updateTodoDto[field];

      if (value === undefined) {
        continue;
      }

      if (value === null) {
        unsetPayload[field] = 1;
        continue;
      }

      if (field === 'recurrence') {
        setPayload.recurrence = this.normalizeRecurrence(
          updateTodoDto.recurrence as RecurrenceConfig,
        );
        continue;
      }

      setPayload[field] = value;
    }

    const updatePayload: Record<string, unknown> = {};
    if (Object.keys(setPayload).length > 0) {
      updatePayload.$set = setPayload;
    }
    if (Object.keys(unsetPayload).length > 0) {
      updatePayload.$unset = unsetPayload;
    }

    return updatePayload;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }

  private async createNextRecurringTodoIfNeeded(
    todoId: string,
    existing: Todo,
    updated: Todo,
    session: ClientSession,
  ): Promise<void> {
    if (
      existing.status === TodoStatus.COMPLETED ||
      updated.status !== TodoStatus.COMPLETED ||
      !updated.recurrence
    ) {
      return;
    }

    const baseDueDate = updated.dueDate
      ? new Date(updated.dueDate)
      : new Date();
    const nextDueDate = this.getNextDueDate(baseDueDate, updated.recurrence);

    const [nextTodo] = await this.todoModel.create(
      [
        this.buildTodoPayload({
          name: updated.name,
          description: updated.description,
          dueDate: nextDueDate,
          priority: updated.priority,
          recurrence: updated.recurrence,
          status: TodoStatus.NOT_STARTED,
        }),
      ],
      { session },
    );

    const todoObjectId = new Types.ObjectId(todoId);
    const activePrerequisiteEdges = await this.todoDependencyModel
      .find({ dependentId: todoObjectId, deletedAt: null })
      .session(session)
      .lean()
      .exec();

    if (activePrerequisiteEdges.length === 0) {
      return;
    }

    const copyEdges = activePrerequisiteEdges.map((edge) => ({
      prerequisiteId: edge.prerequisiteId,
      dependentId: nextTodo._id,
    }));
    await this.todoDependencyModel.insertMany(copyEdges, { session });
  }

  private async ensureDependenciesReadyForInProgress(
    todoId: string,
    session: ClientSession,
  ): Promise<void> {
    const todoObjectId = new Types.ObjectId(todoId);
    const edges = await this.todoDependencyModel
      .find({ dependentId: todoObjectId, deletedAt: null })
      .session(session)
      .lean()
      .exec();

    if (edges.length === 0) {
      return;
    }

    const prerequisiteIds = [
      ...new Set(edges.map((edge) => String(edge.prerequisiteId))),
    ];

    const prerequisites = await this.todoModel
      .find({
        _id: { $in: prerequisiteIds },
        deletedAt: null,
      })
      .session(session)
      .select({ _id: 1, name: 1, status: 1 })
      .lean()
      .exec();

    const readyStatuses = new Set([TodoStatus.COMPLETED, TodoStatus.ARCHIVED]);
    const blockedPrerequisites = prerequisites.filter(
      (todo) => !readyStatuses.has(todo.status),
    );

    const foundIds = new Set(prerequisites.map((todo) => String(todo._id)));
    const missingIds = prerequisiteIds.filter((item) => !foundIds.has(item));

    if (blockedPrerequisites.length === 0 && missingIds.length === 0) {
      return;
    }

    const blockedLabels = blockedPrerequisites.map(
      (todo) => `${todo.name ?? String(todo._id)} (${todo.status})`,
    );
    const messages = [...blockedLabels, ...missingIds];

    throw new BadRequestException(
      `Todo cannot move to IN_PROGRESS until dependencies are COMPLETED or ARCHIVED: ${messages.join(', ')}`,
    );
  }
}
