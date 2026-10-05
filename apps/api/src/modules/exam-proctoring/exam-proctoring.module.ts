import { Module } from '@nestjs/common';
import { ExamProctoringController } from './exam-proctoring.controller';
import { ExamProctoringService } from './exam-proctoring.service';

@Module({
  controllers: [ExamProctoringController],
  providers: [ExamProctoringService],
  exports: [ExamProctoringService],
})
export class ExamProctoringModule {}
