import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';
import { MailModule } from '../src/mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';


@Module({
  imports: [
    PrismaModule,AdminModule,MailModule,PaymentsModule,

    // Register Multer globally for this module.
    // The actual per-route storage config lives in the controller,
    // but we still need to register the module here so NestJS can
    // resolve the FileInterceptor dependency.
    MulterModule.register({ dest: './uploads/profiles' }),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  // Export the service in case other modules (e.g. AdminModule)
  // need to call profile methods directly.
  exports: [ProfileService],
})
export class ProfileModule {}
