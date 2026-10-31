import { Module } from '@nestjs/common';
import { PointTransactionsService } from './point-transactions.service';
import { PointTransactionsController } from './point-transactions.controller';
import { PointAwardConsumer } from './point-award.consumer';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ScoreRulesModule } from '../score-rules/score-rules.module';

@Module({
  imports: [PrismaModule, ScoreRulesModule],
  controllers: [PointTransactionsController],
  providers: [PointTransactionsService, PointAwardConsumer],
  exports: [PointTransactionsService],
})
export class PointTransactionsModule {}
