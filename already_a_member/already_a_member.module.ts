import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { AlreadyAMemberController } from './already_a_member.controller';
import { AlreadyAMemberService } from './already_a_member.service';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    MulterModule.register({ dest: './uploads/profiles' }),
  ],
  controllers: [AlreadyAMemberController],
  providers: [AlreadyAMemberService],
})
export class AlreadyAMemberModule {}