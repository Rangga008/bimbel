import { Module } from '@nestjs/common';
import { ExamAttemptsModule } from '../exam-attempts/exam-attempts.module';
import { ExamProctoringController } from './exam-proctoring.controller';
import { ExamProctoringService } from './exam-proctoring.service';

@Module({
  imports: [ExamAttemptsModule],
  controllers: [ExamProctoringController],
  providers: [ExamProctoringService],
  exports: [ExamProctoringService],
})
export class ExamProctoringModule {}
