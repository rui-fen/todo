import type { Server } from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Response } from 'supertest';
import { TransformInterceptor } from '../src/transform.interceptor';
import { TodosController } from '../src/todos/todos.controller';
import { TodosService } from '../src/todos/todos.service';
import { DependencyStatus, TodoPriority, TodoStatus } from '../src/todos/types';

jest.mock('../src/todos/todos.service', () => ({
  TodosService: class MockTodosService {},
}));

const getResponseMessage = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return undefined;
  }

  return body.message;
};

describe('Todos API (e2e)', () => {
  let app: INestApplication;
  let httpServer: Server;

  const todo = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Write e2e tests',
    description: 'Verify request validation and responses',
    status: TodoStatus.NOT_STARTED,
    priority: TodoPriority.MEDIUM,
    dependencyStatus: DependencyStatus.UNBLOCKED,
    dueDate: '2026-03-31T10:00:00.000Z',
    recurrence: undefined,
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:00:00.000Z',
    deletedAt: null,
  };
  const serializedTodo = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Write e2e tests',
    description: 'Verify request validation and responses',
    status: TodoStatus.NOT_STARTED,
    priority: TodoPriority.MEDIUM,
    dependencyStatus: DependencyStatus.UNBLOCKED,
    dueDate: '2026-03-31T10:00:00.000Z',
    createdAt: '2026-03-29T10:00:00.000Z',
    updatedAt: '2026-03-29T10:00:00.000Z',
    deletedAt: null,
  };
  const graphResponse = {
    rootId: todo._id,
    nodes: [todo],
    edges: [
      {
        prerequisiteId: '507f1f77bcf86cd799439012',
        dependentId: todo._id,
      },
    ],
  };
  const serializedGraphResponse = {
    rootId: todo._id,
    nodes: [serializedTodo],
    edges: [
      {
        prerequisiteId: '507f1f77bcf86cd799439012',
        dependentId: todo._id,
      },
    ],
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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TodosController],
      providers: [
        {
          provide: TodosService,
          useValue: todoService,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /todo returns wrapped success response', async () => {
    todoService.create.mockResolvedValue(todo);

    await request(httpServer)
      .post('/todo')
      .send({
        name: 'Write e2e tests',
        status: TodoStatus.NOT_STARTED,
        priority: TodoPriority.MEDIUM,
      })
      .expect(201)
      .expect({
        success: true,
        data: serializedTodo,
      });

    expect(todoService.create).toHaveBeenCalledWith({
      name: 'Write e2e tests',
      status: TodoStatus.NOT_STARTED,
      priority: TodoPriority.MEDIUM,
    });
  });

  it('POST /todo rejects invalid request body', async () => {
    const response: Response = await request(httpServer)
      .post('/todo')
      .send({
        name: '',
        unknownField: 'ignored',
      })
      .expect(400);

    expect(getResponseMessage(response.body)).toEqual(
      expect.arrayContaining(['name should not be empty']),
    );
    expect(todoService.create).not.toHaveBeenCalled();
  });

  it('GET /todo/search transforms query params and wraps result', async () => {
    todoService.search.mockResolvedValue({
      total: 1,
      page: 2,
      limit: 10,
      results: [todo],
    });

    await request(httpServer)
      .get('/todo/search')
      .query({
        sortBy: 'dueDate',
        sortOrder: 'DESC',
        page: '2',
        limit: '10',
      })
      .expect(200)
      .expect({
        success: true,
        data: {
          total: 1,
          page: 2,
          limit: 10,
          results: [serializedTodo],
        },
      });

    expect(todoService.search).toHaveBeenCalledWith({
      sortBy: 'dueDate',
      sortOrder: 'DESC',
      page: 2,
      limit: 10,
    });
  });

  it('GET /todo/:id rejects invalid mongo id', async () => {
    const response: Response = await request(httpServer)
      .get('/todo/not-a-valid-id')
      .expect(400);

    expect(getResponseMessage(response.body)).toBe(
      'not-a-valid-id is not a valid id',
    );
    expect(todoService.findOne).not.toHaveBeenCalled();
  });

  it('GET /todo/:id returns 404 when todo is missing', async () => {
    todoService.findOne.mockResolvedValue(null);

    const response: Response = await request(httpServer)
      .get(`/todo/${todo._id}`)
      .expect(404);

    expect(getResponseMessage(response.body)).toBe(
      `Todo with id ${todo._id} not found`,
    );
  });

  it('PATCH /todo/:id updates todo and wraps response', async () => {
    const updatedTodo = {
      ...todo,
      status: TodoStatus.IN_PROGRESS,
      updatedAt: '2026-03-29T12:00:00.000Z',
    };
    const serializedUpdatedTodo = {
      ...serializedTodo,
      status: TodoStatus.IN_PROGRESS,
      updatedAt: '2026-03-29T12:00:00.000Z',
    };
    todoService.update.mockResolvedValue(updatedTodo);

    await request(httpServer)
      .patch(`/todo/${todo._id}`)
      .send({
        status: TodoStatus.IN_PROGRESS,
        description: null,
      })
      .expect(200)
      .expect({
        success: true,
        data: serializedUpdatedTodo,
      });

    expect(todoService.update).toHaveBeenCalledWith(todo._id, {
      status: TodoStatus.IN_PROGRESS,
      description: null,
    });
  });

  it('PATCH /todo/:id returns 404 when update target is missing', async () => {
    todoService.update.mockResolvedValue(null);

    const response: Response = await request(httpServer)
      .patch(`/todo/${todo._id}`)
      .send({ status: TodoStatus.IN_PROGRESS })
      .expect(404);

    expect(getResponseMessage(response.body)).toBe(
      `Todo with id ${todo._id} not found`,
    );
  });

  it('DELETE /todo/:id wraps deleted todo response', async () => {
    todoService.remove.mockResolvedValue(todo);

    await request(httpServer).delete(`/todo/${todo._id}`).expect(200).expect({
      success: true,
      data: serializedTodo,
    });

    expect(todoService.remove).toHaveBeenCalledWith(todo._id);
  });

  it('GET /todo/:id/subgraph wraps graph response', async () => {
    todoService.getSubgraph.mockResolvedValue(graphResponse);

    await request(httpServer)
      .get(`/todo/${todo._id}/subgraph`)
      .expect(200)
      .expect({
        success: true,
        data: serializedGraphResponse,
      });

    expect(todoService.getSubgraph).toHaveBeenCalledWith(todo._id);
  });

  it('GET /todo/:id/subgraph returns 404 when graph is missing', async () => {
    todoService.getSubgraph.mockResolvedValue(null);

    const response: Response = await request(httpServer)
      .get(`/todo/${todo._id}/subgraph`)
      .expect(404);

    expect(getResponseMessage(response.body)).toBe(
      `Todo with id ${todo._id} not found`,
    );
  });

  it('POST /todo/:id/dependencies wraps success response', async () => {
    todoService.addDependencies.mockResolvedValue({
      dependentId: todo._id,
      created: 1,
    });

    await request(httpServer)
      .post(`/todo/${todo._id}/dependencies`)
      .send({
        prerequisiteIds: ['507f1f77bcf86cd799439012'],
      })
      .expect(201)
      .expect({
        success: true,
        data: {
          dependentId: todo._id,
          created: 1,
        },
      });

    expect(todoService.addDependencies).toHaveBeenCalledWith(todo._id, [
      '507f1f77bcf86cd799439012',
    ]);
  });

  it('POST /todo/:id/dependencies validates request body', async () => {
    const response: Response = await request(httpServer)
      .post(`/todo/${todo._id}/dependencies`)
      .send({
        prerequisiteIds: [],
      })
      .expect(400);

    expect(getResponseMessage(response.body)).toEqual(
      expect.arrayContaining([
        'prerequisiteIds must contain at least 1 elements',
      ]),
    );
    expect(todoService.addDependencies).not.toHaveBeenCalled();
  });

  it('DELETE /todo/:id/dependencies wraps success response', async () => {
    todoService.removeDependencies.mockResolvedValue({
      dependentId: todo._id,
      removed: 1,
    });

    await request(httpServer)
      .delete(`/todo/${todo._id}/dependencies`)
      .send({
        prerequisiteIds: ['507f1f77bcf86cd799439012'],
      })
      .expect(200)
      .expect({
        success: true,
        data: {
          dependentId: todo._id,
          removed: 1,
        },
      });

    expect(todoService.removeDependencies).toHaveBeenCalledWith(todo._id, [
      '507f1f77bcf86cd799439012',
    ]);
  });
});
