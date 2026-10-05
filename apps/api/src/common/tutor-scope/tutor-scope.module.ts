import { Global, Module } from '@nestjs/common';
import { TutorScopeService } from './tutor-scope.service';

@Global()
@Module({
  providers: [TutorScopeService],
  exports: [TutorScopeService],
})
export class TutorScopeModule {}
