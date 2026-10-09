import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { EventsService } from './events.service';
import { CreateCashTicketDto, RegisterForEventDto, ValidateTicketDto, VerifyEventPaymentDto } from './dto/event.dto';
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

/**
 * Deliberately separate from the admin controller: this is a bearer-link
 * capability for event-day volunteers, not an admin session.
 */
@Controller('check-in')
export class PublicCheckInController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('validate')
  validate(
    @Headers('x-scanner-token') scannerToken: string | undefined,
    @Req() req,
    @Body() dto: ValidateTicketDto,
  ) {
    return this.eventsService.validateTicketWithScannerToken(dto.qrPayload, scannerToken, req.ip);
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
  listRequests(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('eventId') eventId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.eventsService.listRequests(status, search, eventId, Number(page), Number(limit));
  }

  @Get('notifications')
  listAdminNotifications() {
    return this.eventsService.listAdminNotifications();
  }

  @Get('tickets/by-email')
  findTicketsByEmail(@Query('email') email?: string, @Req() req?) {
    return this.eventsService.findTicketsByEmailForAdmin(email ?? '', req.user.userId);
  }

  @Get(':id')
  getEvent(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.eventsService.getAdminEvent(id, status, search, Number(page), Number(limit));
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

  @Post('requests/:id/cancel')
  cancel(@Param('id') id: string, @Req() req, @Body('notes') notes?: string) {
    return this.eventsService.cancelRequest(id, req.user.userId, notes);
  }

  @Post('requests/:id/delete')
  delete(@Param('id') id: string, @Req() req) {
    return this.eventsService.deleteRequest(id, req.user.userId);
  }

  @Post(':eventId/cash-tickets')
  createCashTicket(@Param('eventId') eventId: string, @Req() req, @Body() dto: CreateCashTicketDto) {
    return this.eventsService.createCashTicket(eventId, dto, req.user.userId);
  }

  @Post('tickets/validate')
  validate(@Req() req, @Body() dto: ValidateTicketDto) {
    return this.eventsService.validateTicket(dto.qrPayload, req.user.userId, req.ip, true);
  }

  @Post('tickets/:ticketNumber/reset-check-in')
  resetCheckIn(@Param('ticketNumber') ticketNumber: string, @Req() req) {
    return this.eventsService.resetTicketCheckIn(ticketNumber, req.user.userId, req.ip);
  }
}
