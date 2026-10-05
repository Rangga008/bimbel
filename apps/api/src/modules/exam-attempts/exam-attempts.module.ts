import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ExamsModule } from '../exams/exams.module';
import { PointTransactionsModule } from '../point-transactions/point-transactions.module';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAutoSubmitService } from './exam-auto-submit.service';

@Module({
  imports: [RbacModule, ExamsModule, PointTransactionsModule],
  controllers: [ExamAttemptsController],
  providers: [ExamAttemptsService, ExamAutoSubmitService],
  exports: [ExamAttemptsService],
})
export class ExamAttemptsModule {}
