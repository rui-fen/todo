import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { TodoDto } from './todo.dto';

export class CreateTodoDto extends PartialType(TodoDto) {
  @IsString()
  @IsNotEmpty()
  name: string;
}
