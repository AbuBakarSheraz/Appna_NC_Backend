import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { EventsService } from './events.service';
import { RegisterForEventDto, ValidateTicketDto, VerifyEventPaymentDto } from './dto/event.dto';
import { SquareEventTokenPaymentDto } from '../payments/square-payment.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  listPublishedEvents() {
    return this.eventsService.listPublishedEvents();
  }

  @Get(':slug')
  getPublishedEvent(@Param('slug') slug: string) {
    return this.eventsService.getPublishedEvent(slug);
  }

  @Post(':eventId/registrations')
  register(@Param('eventId') eventId: string, @Body() dto: RegisterForEventDto) {
    return this.eventsService.registerForEvent(eventId, dto);
  }

  @Post('square/verify')
  verifyPayment(@Body() dto: VerifyEventPaymentDto) {
    return this.eventsService.verifyEventPayment(dto);
  }

  @Post('square/pay')
  payWithSquareToken(@Body() dto: SquareEventTokenPaymentDto) {
    return this.eventsService.payEventWithSquareToken(dto);
  }

  @Post('square/webhook')
  squareWebhook(@Req() req, @Headers() headers: Record<string, string | string[]>, @Body() body: unknown) {
    return this.eventsService.handleSquareWebhook(headers, body, req.rawBody);
  }

  @Post('paypal/capture')
  legacyCapturePayment(@Body() dto: VerifyEventPaymentDto) {
    return this.eventsService.verifyEventPayment(dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('me')
  getMyTickets(@Req() req) {
    return this.eventsService.getMyTickets(req.user.userId);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('me')
  getMyNotifications(@Req() req) {
    return this.eventsService.listMyNotifications(req.user.userId);
  }
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('analytics')
  getAnalytics() {
    return this.eventsService.getAnalytics();
  }

  @Get()
  listEvents() {
    return this.eventsService.listAdminEvents();
  }

  @Get('requests')
  listRequests(@Query('status') status?: string, @Query('search') search?: string) {
    return this.eventsService.listRequests(status, search);
  }

  @Get('notifications')
  listAdminNotifications() {
    return this.eventsService.listAdminNotifications();
  }

  @Get(':id')
  getEvent(@Param('id') id: string, @Query('status') status?: string, @Query('search') search?: string) {
    return this.eventsService.getAdminEvent(id, status, search);
  }

  @Post()
  createEvent(@Req() req, @Body() dto) {
    return this.eventsService.createEvent(dto, req.user.userId);
  }

  @Post(':id')
  updateEvent(@Param('id') id: string, @Req() req, @Body() dto) {
    return this.eventsService.updateEvent(id, dto, req.user.userId);
  }

  @Post(':id/status/:status')
  setStatus(@Param('id') id: string, @Param('status') status: any, @Req() req) {
    return this.eventsService.setEventStatus(id, status, req.user.userId);
  }

  @Post(':id/delete')
  deleteEvent(@Param('id') id: string, @Req() req) {
    return this.eventsService.deleteEvent(id, req.user.userId);
  }

  @Post('requests/:id/approve')
  approve(@Param('id') id: string, @Req() req, @Body('notes') notes?: string) {
    return this.eventsService.approveRequest(id, req.user.userId, notes);
  }

  @Post('requests/:id/reject')
  reject(@Param('id') id: string, @Req() req, @Body('notes') notes?: string) {
    return this.eventsService.rejectRequest(id, req.user.userId, notes);
  }

  @Post('tickets/validate')
  validate(@Req() req, @Body() dto: ValidateTicketDto) {
    return this.eventsService.validateTicket(dto.qrPayload, req.user.userId, req.ip, true);
  }
}
