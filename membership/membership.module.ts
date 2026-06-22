import { Module } from '@nestjs/common';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { MembershipExpiryService } from './membership-expiry.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [MembershipController],
  providers: [MembershipService, MembershipExpiryService],
  exports: [MembershipService],
})
export class MembershipModule {}
