import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../src/mail/mail.module';
import { PaymentsModule } from '../payments/payments.module';
import { EventsService } from './events.service';
import {
  AdminEventsController,
  EventsController,
  NotificationsController,
  PublicCheckInController,
  TicketsController,
} from './events.controller';

@Module({
  imports: [PrismaModule, MailModule, PaymentsModule],
  controllers: [EventsController, TicketsController, PublicCheckInController, NotificationsController, AdminEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
