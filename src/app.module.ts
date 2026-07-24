import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { MembershipModule } from '../membership/membership.module';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { MailModule } from './mail/mail.module';
import { EventsModule } from '../events/events.module';
import { AlreadyAMemberModule } from 'already_a_member/already_a_member.module';
import { SponsorshipModule } from '../sponsorship/sponsorship.module';

@Module({
  imports: [
    PrismaModule,
    ProfileModule,
    MembershipModule,
    AuthModule,
    AdminModule,
    MailModule,
    EventsModule,
     AlreadyAMemberModule,
     SponsorshipModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
