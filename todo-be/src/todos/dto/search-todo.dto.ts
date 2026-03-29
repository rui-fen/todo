import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DependencyStatus, TodoPriority, TodoStatus } from '../types';

export enum SortBy {
  DUE_DATE = 'dueDate',
  PRIORITY = 'priority',
  STATUS = 'status',
  NAME = 'name',
}

export enum SortOrder {
  DESC = 'DESC',
  ASC = 'ASC',
}

export class SearchTodoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(TodoStatus)
  status?: TodoStatus;

  @IsOptional()
  @IsEnum(TodoPriority)
  priority?: TodoPriority;

  @IsOptional()
  @IsDateString()
  dueDateStart?: string;

  @IsOptional()
  @IsDateString()
  dueDateEnd?: string;

  @IsOptional()
  @IsEnum(DependencyStatus)
  dependencyStatus?: DependencyStatus;

  @IsEnum(SortBy)
  sortBy: SortBy = SortBy.DUE_DATE;

  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.DESC;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  limit: number = 10;
}
