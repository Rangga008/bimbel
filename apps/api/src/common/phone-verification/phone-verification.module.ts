import { Global, Module } from '@nestjs/common';
import { WhatsAppModule } from '../../modules/whatsapp/whatsapp.module';
import { PhoneVerificationService } from './phone-verification.service';

@Global()
@Module({
  imports: [WhatsAppModule],
  providers: [PhoneVerificationService],
  exports: [PhoneVerificationService],
})
export class PhoneVerificationModule {}
