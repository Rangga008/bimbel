import { Module } from '@nestjs/common';
import { ScoreRulesService } from './score-rules.service';
import { ScoreRulesController } from './score-rules.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ScoreRulesController],
  providers: [ScoreRulesService],
  exports: [ScoreRulesService],
})
export class ScoreRulesModule {}
