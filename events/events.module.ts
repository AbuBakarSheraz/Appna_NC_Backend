import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { EventsService } from './events.service';
import { AdminEventsController, EventsController, NotificationsController, TicketsController } from './events.controller';

@Module({
  imports: [PrismaModule, MailModule, PaymentsModule],
  controllers: [EventsController, TicketsController, NotificationsController, AdminEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
