import { Module } from '@nestjs/common';
import { PointTransactionsService } from './point-transactions.service';
import { PointTransactionsController } from './point-transactions.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { ScoreRulesModule } from '../score-rules/score-rules.module';

@Module({
  imports: [PrismaModule, ScoreRulesModule],
  controllers: [PointTransactionsController],
  providers: [PointTransactionsService],
  exports: [PointTransactionsService],
})
export class PointTransactionsModule {}
