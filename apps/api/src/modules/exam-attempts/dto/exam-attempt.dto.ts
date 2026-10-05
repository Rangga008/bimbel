import { IsArray, IsOptional, IsString } from 'class-validator';

export class SaveExamAnswerDto {
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds?: string[];

  @IsOptional()
  @IsString()
  textAnswer?: string;
}

export class SubmitExamDto {
  // Empty for now - submit is just a status change
}
