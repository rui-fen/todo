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
});
