import { IsString, IsOptional, IsEnum } from 'class-validator';

export enum ProctoringViolationType {
  FULLSCREEN_EXIT = 'FULLSCREEN_EXIT',
  VISIBILITY_CHANGE = 'VISIBILITY_CHANGE',
  BLUR = 'BLUR',
  TAB_LEAVE = 'TAB_LEAVE',
}

export class ReportViolationDto {
  @IsEnum(ProctoringViolationType)
  violationType: ProctoringViolationType;

  @IsOptional()
  @IsString()
  details?: string;
}

export class UnlockAttemptDto {
  @IsString()
  reason: string;
}
