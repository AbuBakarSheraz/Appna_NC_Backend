import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import {  MembershipModule } from '../membership/membership.module';
import { AuthModule } from '../auth/auth.module'; // ✅ correct path
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    ProfileModule,
    MembershipModule,
    AuthModule, // ✅ MUST be here
    MailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
