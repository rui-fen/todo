import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Recurrence, RecurrenceUnit, TodoPriority, TodoStatus } from '../types';

export class RecurrenceDto {
  @IsEnum(Recurrence)
  type: Recurrence;

  @ValidateIf((o: RecurrenceDto) => o.type === Recurrence.CUSTOM)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  interval?: number;

  @ValidateIf((o: RecurrenceDto) => o.type === Recurrence.CUSTOM)
  @IsEnum(RecurrenceUnit)
  unit?: RecurrenceUnit;
}

export class TodoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}
