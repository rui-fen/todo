import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SortBy, SortOrder } from './dto/search-todo.dto';
import { TodosService } from './todos.service';
import { Recurrence, RecurrenceUnit, TodoPriority, TodoStatus } from './types';

jest.mock('./schemas/todo.schema', () => ({
  Todo: class Todo {},
}));

jest.mock('./schemas/todo-dependency.schema', () => ({
  TodoDependency: class TodoDependency {},
}));

const createExecChain = <T>(result: T) => {
  const chain = {
    session: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };

  return chain;
};

const createSession = () => ({
  startTransaction: jest.fn(),
  abortTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
});

describe('TodosService', () => {
  let service: TodosService;
  let todoModel: {
    create: jest.Mock;
    findOne: jest.Mock;
    aggregate: jest.Mock;
    findOneAndUpdate: jest.Mock;
    updateOne: jest.Mock;
    find: jest.Mock;
    db: { startSession: jest.Mock };
    collection: { name: string };
  };
  let todoDependencyModel: {
    find: jest.Mock;
    updateMany: jest.Mock;
    insertMany: jest.Mock;
    collection: { name: string };
  };

  beforeEach(() => {
    todoModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      aggregate: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn(),
      db: { startSession: jest.fn() },
      collection: { name: 'todos' },
    };

    todoDependencyModel = {
      find: jest.fn(),
      updateMany: jest.fn(),
      insertMany: jest.fn(),
      collection: { name: 'todo_dependencies' },
    };

    service = new TodosService(
      todoModel as never,
      todoDependencyModel as never,
    );
  });

  it('creates a todo with normalized recurrence payload', async () => {
    const dto = {
      name: 'Recurring task',
      dueDate: '2026-03-31T10:00:00.000Z',
      priority: TodoPriority.HIGH,
      status: TodoStatus.NOT_STARTED,
      recurrence: {
        type: Recurrence.CUSTOM,
        interval: 2,
        unit: RecurrenceUnit.WEEK,
      },
    };
    const created = { _id: '1', ...dto };
    todoModel.create.mockResolvedValue(created);

    await expect(service.create(dto)).resolves.toEqual(created);
    expect(todoModel.create).toHaveBeenCalledWith({
      ...dto,
      recurrence: {
        type: Recurrence.CUSTOM,
        interval: 2,
        unit: RecurrenceUnit.WEEK,
      },
    });
  });

  it('rejects recurrence todo without due date on create', async () => {
    await expect(
      service.create({
        name: 'Recurring task',
        recurrence: { type: Recurrence.DAILY },
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Due date is required when recurrence is provided',
      ),
    );
  });

  it('returns todo by id when found', async () => {
    const todo = { _id: '507f1f77bcf86cd799439011', name: 'Task' };
    const query = createExecChain(todo);
    todoModel.findOne.mockReturnValue(query);

    await expect(service.findOne(todo._id)).resolves.toEqual(todo);
    expect(todoModel.findOne).toHaveBeenCalledWith({
      _id: todo._id,
      deletedAt: null,
    });
  });

  it('builds search aggregation and unwraps results', async () => {
    let capturedPipeline: unknown[] | undefined;
    const aggregateQuery = createExecChain([
      {
        metadata: [{ total: 1 }],
        results: [{ _id: '507f1f77bcf86cd799439011', name: 'Task' }],
      },
    ]);
    todoModel.aggregate.mockImplementation((pipeline: unknown[]) => {
      capturedPipeline = pipeline;
      return aggregateQuery;
    });

    const result = await service.search({
      name: 'Task',
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dependencyStatus: undefined,
      dueDateStart: '2026-03-01T00:00:00.000Z',
      dueDateEnd: '2026-03-31T23:59:59.999Z',
      sortBy: SortBy.DUE_DATE,
      sortOrder: SortOrder.DESC,
      page: 2,
      limit: 10,
    });

    expect(result).toEqual({
      total: 1,
      page: 2,
      limit: 10,
      results: [{ _id: '507f1f77bcf86cd799439011', name: 'Task' }],
    });
    expect(todoModel.aggregate).toHaveBeenCalledTimes(1);
    expect(Array.isArray(capturedPipeline)).toBe(true);

    const pipeline = capturedPipeline as Array<Record<string, unknown>>;
    const matchStage = pipeline.find(
      (stage): stage is { $match: Record<string, unknown> } =>
        '$match' in stage,
    );
    const facetStage = pipeline.find(
      (stage): stage is { $facet: { results: unknown[] } } => '$facet' in stage,
    );

    expect(matchStage).toBeDefined();
    expect(matchStage?.$match).toEqual(
      expect.objectContaining({
        deletedAt: null,
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
        name: { $regex: 'Task', $options: 'i' },
      }),
    );

    expect(facetStage).toBeDefined();
    expect(facetStage?.$facet.results).toEqual(
      expect.arrayContaining([
        { $sort: { dueDate: -1, _id: -1 } },
        { $skip: 10 },
        { $limit: 10 },
      ]),
    );
  });

  it('returns zero creations immediately when prerequisiteIds is empty', async () => {
    await expect(service.addDependencies('todo-1', [])).resolves.toEqual({
      dependentId: 'todo-1',
      created: 0,
    });
    expect(todoModel.db.startSession).not.toHaveBeenCalled();
  });

  it('rejects self dependency before writing edges', async () => {
    const session = createSession();
    const dependentId = new Types.ObjectId().toString();
    todoModel.db.startSession.mockResolvedValue(session);
    todoModel.findOne.mockReturnValue(
      createExecChain({ _id: dependentId, name: 'Parent task' }),
    );

    await expect(
      service.addDependencies(dependentId, [dependentId]),
    ).rejects.toThrow(new BadRequestException('Todo cannot depend on itself'));
    expect(todoDependencyModel.insertMany).not.toHaveBeenCalled();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('throws when dependent todo does not exist during addDependencies', async () => {
    const session = createSession();
    todoModel.db.startSession.mockResolvedValue(session);
    todoModel.findOne.mockReturnValue(createExecChain(null));

    await expect(
      service.addDependencies(new Types.ObjectId().toString(), [
        new Types.ObjectId().toString(),
      ]),
    ).rejects.toThrow(NotFoundException);
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('returns zero removals when prerequisiteIds is empty', async () => {
    const session = createSession();
    const dependentId = new Types.ObjectId().toString();
    todoModel.db.startSession.mockResolvedValue(session);

    await expect(service.removeDependencies(dependentId, [])).resolves.toEqual({
      dependentId,
      removed: 0,
    });
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(todoDependencyModel.updateMany).not.toHaveBeenCalled();
  });

  it('returns empty dependency list when no edges exist', async () => {
    todoDependencyModel.find.mockReturnValue(createExecChain([]));

    await expect(
      service.listDependencies(new Types.ObjectId().toString()),
    ).resolves.toEqual([]);
    expect(todoModel.find).not.toHaveBeenCalled();
  });

  it('updates todo status and commits transaction when found', async () => {
    const session = createSession();
    const id = new Types.ObjectId().toString();
    const existing = {
      _id: id,
      name: 'Task',
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dueDate: undefined,
      recurrence: undefined,
    };
    const updated = {
      ...existing,
      status: TodoStatus.COMPLETED,
    };

    todoModel.db.startSession.mockResolvedValue(session);
    todoModel.findOne.mockReturnValue(createExecChain(existing));
    todoModel.findOneAndUpdate.mockReturnValue(createExecChain(updated));

    await expect(
      service.update(id, { status: TodoStatus.COMPLETED }),
    ).resolves.toEqual(updated);
    expect(todoModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, deletedAt: null },
      { $set: { status: TodoStatus.COMPLETED } },
      expect.objectContaining({
        returnDocument: 'after',
        session,
      }),
    );
    expect(session.commitTransaction).toHaveBeenCalled();
    expect(session.endSession).toHaveBeenCalled();
  });

  it('returns null and aborts transaction when update target is missing', async () => {
    const session = createSession();
    const id = new Types.ObjectId().toString();

    todoModel.db.startSession.mockResolvedValue(session);
    todoModel.findOne.mockReturnValue(createExecChain(null));

    await expect(
      service.update(id, { status: TodoStatus.COMPLETED }),
    ).resolves.toBeNull();
    expect(session.abortTransaction).toHaveBeenCalled();
    expect(todoModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('throws when update enables recurrence without due date', async () => {
    const session = createSession();
    const id = new Types.ObjectId().toString();
    const existing = {
      _id: id,
      name: 'Task',
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
      dueDate: undefined,
      recurrence: undefined,
    };

    todoModel.db.startSession.mockResolvedValue(session);
    todoModel.findOne.mockReturnValue(createExecChain(existing));

    await expect(
      service.update(id, {
        recurrence: { type: Recurrence.DAILY },
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Due date is required when recurrence is provided',
      ),
    );
    expect(session.abortTransaction).toHaveBeenCalled();
  });

  it('returns deduplicated subgraph edges', async () => {
    const rootId = new Types.ObjectId().toString();
    const sharedPrerequisiteId = new Types.ObjectId();
    const dependentId = new Types.ObjectId();
    const graphResult = [
      {
        nodeIds: [
          new Types.ObjectId(rootId),
          sharedPrerequisiteId,
          dependentId,
        ],
        upstreamEdges: [
          {
            prerequisiteId: sharedPrerequisiteId,
            dependentId,
          },
        ],
        downstreamEdges: [
          {
            prerequisiteId: sharedPrerequisiteId,
            dependentId,
          },
        ],
      },
    ];
    todoModel.aggregate.mockReturnValue(createExecChain(graphResult));
    todoModel.find.mockReturnValue(
      createExecChain([
        { _id: rootId, name: 'Root' },
        { _id: String(sharedPrerequisiteId), name: 'Parent' },
      ]),
    );

    const result = await service.getSubgraph(rootId);

    expect(result).toEqual({
      rootId,
      nodes: [
        { _id: rootId, name: 'Root' },
        { _id: String(sharedPrerequisiteId), name: 'Parent' },
      ],
      edges: [
        {
          prerequisiteId: String(sharedPrerequisiteId),
          dependentId: String(dependentId),
        },
      ],
    });
  });
});
