import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { SponsorshipController } from './sponsorship.controller';
import { SponsorshipService } from './sponsorship.service';

@Module({
  imports: [PrismaModule, MailModule, PaymentsModule],
  controllers: [SponsorshipController],
  providers: [SponsorshipService],
  exports: [SponsorshipService],
})
export class SponsorshipModule {}