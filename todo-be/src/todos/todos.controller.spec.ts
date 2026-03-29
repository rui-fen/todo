import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AddDependenciesDto } from './dto/add-dependencies.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { SearchTodoDto } from './dto/search-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { TodosController } from './todos.controller';
import { TodosService } from './todos.service';
import { DependencyStatus, TodoPriority, TodoStatus } from './types';

jest.mock('./todos.service', () => ({
  TodosService: class MockTodosService {},
}));

describe('TodosController', () => {
  let controller: TodosController;

  const mockTodo = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Write tests',
    description: 'Cover controller behaviors',
    status: TodoStatus.NOT_STARTED,
    priority: TodoPriority.MEDIUM,
    dependencyStatus: DependencyStatus.UNBLOCKED,
    dueDate: '2026-03-31T10:00:00.000Z',
    recurrence: undefined,
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:00:00.000Z',
    deletedAt: null,
  };

  const todoService = {
    create: jest.fn(),
    search: jest.fn(),
    addDependencies: jest.fn(),
    removeDependencies: jest.fn(),
    listDependencies: jest.fn(),
    listDependents: jest.fn(),
    getSubgraph: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TodosController],
      providers: [
        {
          provide: TodosService,
          useValue: todoService,
        },
      ],
    }).compile();

    controller = module.get<TodosController>(TodosController);
  });

  it('creates a todo', async () => {
    const dto: CreateTodoDto = {
      name: 'Write tests',
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
    };
    todoService.create.mockResolvedValue(mockTodo);

    await expect(controller.create(dto)).resolves.toEqual(mockTodo);
    expect(todoService.create).toHaveBeenCalledWith(dto);
  });

  it('searches todos', async () => {
    const query: SearchTodoDto = {
      sortBy: 'dueDate' as SearchTodoDto['sortBy'],
      sortOrder: 'DESC' as SearchTodoDto['sortOrder'],
      page: 1,
      limit: 10,
    };
    const result = {
      total: 1,
      page: 1,
      limit: 10,
      results: [mockTodo],
    };
    todoService.search.mockResolvedValue(result);

    await expect(controller.search(query)).resolves.toEqual(result);
    expect(todoService.search).toHaveBeenCalledWith(query);
  });

  it('adds dependencies', async () => {
    const id = mockTodo._id;
    const body: AddDependenciesDto = {
      prerequisiteIds: ['507f1f77bcf86cd799439012'],
    };
    const result = { dependentId: id, created: 1 };
    todoService.addDependencies.mockResolvedValue(result);

    await expect(controller.addDependencies(id, body)).resolves.toEqual(result);
    expect(todoService.addDependencies).toHaveBeenCalledWith(
      id,
      body.prerequisiteIds,
    );
  });

  it('passes an empty array when addDependencies body is missing ids', async () => {
    const id = mockTodo._id;
    const result = { dependentId: id, created: 0 };
    todoService.addDependencies.mockResolvedValue(result);

    await expect(
      controller.addDependencies(id, {} as AddDependenciesDto),
    ).resolves.toEqual(result);
    expect(todoService.addDependencies).toHaveBeenCalledWith(id, []);
  });

  it('removes dependencies', async () => {
    const id = mockTodo._id;
    const body: AddDependenciesDto = {
      prerequisiteIds: ['507f1f77bcf86cd799439012'],
    };
    const result = { dependentId: id, removed: 1 };
    todoService.removeDependencies.mockResolvedValue(result);

    await expect(controller.removeDependencies(id, body)).resolves.toEqual(
      result,
    );
    expect(todoService.removeDependencies).toHaveBeenCalledWith(
      id,
      body.prerequisiteIds,
    );
  });

  it('passes an empty array when removeDependencies body is missing ids', async () => {
    const id = mockTodo._id;
    const result = { dependentId: id, removed: 0 };
    todoService.removeDependencies.mockResolvedValue(result);

    await expect(
      controller.removeDependencies(id, {} as AddDependenciesDto),
    ).resolves.toEqual(result);
    expect(todoService.removeDependencies).toHaveBeenCalledWith(id, []);
  });

  it('lists dependencies', async () => {
    todoService.listDependencies.mockResolvedValue([mockTodo]);

    await expect(controller.listDependencies(mockTodo._id)).resolves.toEqual([
      mockTodo,
    ]);
    expect(todoService.listDependencies).toHaveBeenCalledWith(mockTodo._id);
  });

  it('lists dependents', async () => {
    todoService.listDependents.mockResolvedValue([mockTodo]);

    await expect(controller.listDependents(mockTodo._id)).resolves.toEqual([
      mockTodo,
    ]);
    expect(todoService.listDependents).toHaveBeenCalledWith(mockTodo._id);
  });

  it('returns subgraph when found', async () => {
    const result = {
      rootId: mockTodo._id,
      nodes: [mockTodo],
      edges: [
        {
          prerequisiteId: '507f1f77bcf86cd799439012',
          dependentId: mockTodo._id,
        },
      ],
    };
    todoService.getSubgraph.mockResolvedValue(result);

    await expect(controller.subgraph(mockTodo._id)).resolves.toEqual(result);
    expect(todoService.getSubgraph).toHaveBeenCalledWith(mockTodo._id);
  });

  it('throws when subgraph is missing', async () => {
    todoService.getSubgraph.mockResolvedValue(null);

    await expect(controller.subgraph(mockTodo._id)).rejects.toThrow(
      new NotFoundException(`Todo with id ${mockTodo._id} not found`),
    );
  });

  it('returns a todo by id', async () => {
    todoService.findOne.mockResolvedValue(mockTodo);

    await expect(controller.findOne(mockTodo._id)).resolves.toEqual(mockTodo);
    expect(todoService.findOne).toHaveBeenCalledWith(mockTodo._id);
  });

  it('throws when todo is not found by id', async () => {
    todoService.findOne.mockResolvedValue(null);

    await expect(controller.findOne(mockTodo._id)).rejects.toThrow(
      new NotFoundException(`Todo with id ${mockTodo._id} not found`),
    );
  });

  it('updates a todo', async () => {
    const dto: UpdateTodoDto = {
      status: TodoStatus.IN_PROGRESS,
    };
    const updatedTodo = {
      ...mockTodo,
      status: TodoStatus.IN_PROGRESS,
    };
    todoService.update.mockResolvedValue(updatedTodo);

    await expect(controller.update(mockTodo._id, dto)).resolves.toEqual(
      updatedTodo,
    );
    expect(todoService.update).toHaveBeenCalledWith(mockTodo._id, dto);
  });

  it('throws when updated todo does not exist', async () => {
    todoService.update.mockResolvedValue(null);

    await expect(
      controller.update(mockTodo._id, {
        status: TodoStatus.IN_PROGRESS,
      }),
    ).rejects.toThrow(
      new NotFoundException(`Todo with id ${mockTodo._id} not found`),
    );
  });

  it('removes a todo', async () => {
    todoService.remove.mockResolvedValue(mockTodo);

    await expect(controller.remove(mockTodo._id)).resolves.toEqual(mockTodo);
    expect(todoService.remove).toHaveBeenCalledWith(mockTodo._id);
  });

  it('throws when removed todo does not exist', async () => {
    todoService.remove.mockResolvedValue(null);

    await expect(controller.remove(mockTodo._id)).rejects.toThrow(
      new NotFoundException(`Todo with id ${mockTodo._id} not found`),
    );
  });
});
