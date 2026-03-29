import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AddDependenciesDto } from './dto/add-dependencies.dto';
import { CreateTodoDto } from './dto/create-todo.dto';
import { SearchTodoDto } from './dto/search-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { MongoIdPipe } from './mongo-id.pipe';
import { TodosService } from './todos.service';

@Controller('todo')
export class TodosController {
  constructor(private readonly todoService: TodosService) {}

  @Post()
  create(@Body() createTodoDto: CreateTodoDto) {
    return this.todoService.create(createTodoDto);
  }

  @Get('search')
  search(@Query() query: SearchTodoDto) {
    return this.todoService.search(query);
  }

  @Post(':id/dependencies')
  addDependencies(
    @Param('id', MongoIdPipe) id: string,
    @Body() body: AddDependenciesDto,
  ) {
    return this.todoService.addDependencies(id, body.prerequisiteIds ?? []);
  }

  @Delete(':id/dependencies')
  removeDependencies(
    @Param('id', MongoIdPipe) id: string,
    @Body() body: AddDependenciesDto,
  ) {
    return this.todoService.removeDependencies(id, body.prerequisiteIds ?? []);
  }

  @Get(':id/dependencies')
  listDependencies(@Param('id', MongoIdPipe) id: string) {
    return this.todoService.listDependencies(id);
  }

  @Get(':id/dependents')
  listDependents(@Param('id', MongoIdPipe) id: string) {
    return this.todoService.listDependents(id);
  }

  @Get(':id/subgraph')
  async subgraph(@Param('id', MongoIdPipe) id: string) {
    const subgraph = await this.todoService.getSubgraph(id);
    if (!subgraph) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }
    return subgraph;
  }

  @Get(':id')
  async findOne(@Param('id', MongoIdPipe) id: string) {
    const todo = await this.todoService.findOne(id);
    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }
    return todo;
  }

  @Patch(':id')
  async update(
    @Param('id', MongoIdPipe) id: string,
    @Body() updateTodoDto: UpdateTodoDto,
  ) {
    const todo = await this.todoService.update(id, updateTodoDto);
    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }
    return todo;
  }

  @Delete(':id')
  async remove(@Param('id', MongoIdPipe) id: string) {
    const todo = await this.todoService.remove(id);
    if (!todo) {
      throw new NotFoundException(`Todo with id ${id} not found`);
    }
    return todo;
  }
}
