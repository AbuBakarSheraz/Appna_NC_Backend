import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { AdminCmeController, CmeController } from './cme.controller';
import { CmeService } from './cme.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [CmeController, AdminCmeController],
  providers: [CmeService],
})
export class CmeModule {}
