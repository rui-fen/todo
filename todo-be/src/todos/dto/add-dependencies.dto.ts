import { ArrayMinSize, ArrayUnique, IsArray, IsMongoId } from 'class-validator';

export class AddDependenciesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsMongoId({ each: true })
  prerequisiteIds: string[];
}
