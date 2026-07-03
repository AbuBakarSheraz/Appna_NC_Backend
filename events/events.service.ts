import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, TicketRequestStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { SquareService } from '../payments/square.service';
import { SquareEventTokenPaymentDto } from '../payments/square-payment.dto';
import { buildTicketCardPng } from '../common/card-image';
import {
  CreateEventDto,
  RegisterForEventDto,
  RegistrationFieldDto,
  UpdateEventDto,
  VerifyEventPaymentDto,
} from './dto/event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly squareService: SquareService,
  ) {}

  async listPublishedEvents() {
    return this.prisma.event.findMany({
      where: { status: 'PUBLISHED', date: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      orderBy: { date: 'asc' },
      include: { registrationFields: { orderBy: { position: 'asc' } } },
    });
  }

  async getPublishedEvent(slug: string) {
    const event = await this.prisma.event.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: { registrationFields: { orderBy: { position: 'asc' } } },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  async createEvent(dto: CreateEventDto, actorId: string) {
    const slug = await this.uniqueSlug(dto.title);
    const { registrationFields, ...eventData } = dto;

    const event = await this.prisma.event.create({
      data: {
        ...eventData,
        slug,
        date: new Date(dto.date),
        registrationFields: {
          create: this.normalizeFields(registrationFields),
        },
      },
      include: { registrationFields: { orderBy: { position: 'asc' } } },
    });

    await this.audit(event.id, actorId, 'EVENT_CREATED', { title: event.title });
    return event;
  }

  async updateEvent(id: string, dto: UpdateEventDto, actorId: string) {
    const existing = await this.prisma.event.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Event not found');

    const { registrationFields, ...eventData } = dto;
    const data: Prisma.EventUpdateInput = {
      ...eventData,
      ...(dto.date ? { date: new Date(dto.date) } : {}),
      ...(dto.title && dto.title !== existing.title ? { slug: await this.uniqueSlug(dto.title, id) } : {}),
    };

    const event = await this.prisma.$transaction(async (tx) => {
      if (registrationFields) {
        await tx.eventRegistrationField.deleteMany({ where: { eventId: id } });
      }

      return tx.event.update({
        where: { id },
        data: {
          ...data,
          ...(registrationFields
            ? { registrationFields: { create: this.normalizeFields(registrationFields) } }
            : {}),
        },
        include: { registrationFields: { orderBy: { position: 'asc' } } },
      });
    });

    await this.audit(id, actorId, 'EVENT_UPDATED', { title: event.title });
    return event;
  }

  async deleteEvent(id: string, actorId: string) {
    await this.ensureEvent(id);
    await this.prisma.event.delete({ where: { id } });
    await this.audit(id, actorId, 'EVENT_DELETED', {});
    return { message: 'Event deleted' };
  }

  async setEventStatus(id: string, status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED', actorId: string) {
    await this.ensureEvent(id);
    const event = await this.prisma.event.update({ where: { id }, data: { status } });
    await this.audit(id, actorId, 'EVENT_STATUS_CHANGED', { status });
    return event;
  }

  async listAdminEvents() {
    const [events, statusCounts] = await Promise.all([
      this.prisma.event.findMany({
      orderBy: { date: 'desc' },
      include: {
        _count: { select: { ticketRequests: true, tickets: true } },
      },
      }),
      this.prisma.ticketRequest.groupBy({
        by: ['eventId', 'approvalStatus'],
        _count: { _all: true },
      }),
    ]);

    const countsByEvent = statusCounts.reduce<Record<string, Record<string, number>>>((acc, row) => {
      acc[row.eventId] ??= {};
      acc[row.eventId][row.approvalStatus] = row._count._all;
      return acc;
    }, {});

    return events.map((event) => {
      const counts = countsByEvent[event.id] ?? {};
      return {
        ...event,
        registrationCount: event._count.ticketRequests,
        pendingCount: (counts.PENDING_PAYMENT ?? 0) + (counts.PAYMENT_COMPLETED ?? 0) + (counts.AWAITING_ADMIN_CONFIRMATION ?? 0),
        approvedCount: counts.CONFIRMED ?? 0,
        rejectedCount: counts.REJECTED ?? 0,
      };
    });
  }

  async getAdminEvent(id: string, status?: string, search?: string) {
    const requestWhere: Prisma.TicketRequestWhereInput = {
      ...(status && status !== 'ALL' ? { approvalStatus: status as TicketRequestStatus } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search } },
              { email: { contains: search } },
              { requestNumber: { contains: search } },
              { tickets: { some: { ticketNumber: { contains: search } } } },
            ],
          }
        : {}),
    };

    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        registrationFields: { orderBy: { position: 'asc' } },
        ticketRequests: {
          where: requestWhere,
          orderBy: { createdAt: 'desc' },
          include: {
            event: true,
            tickets: { orderBy: { ticketIndex: 'asc' } },
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                membership: { select: { isActive: true, type: true, paymentStatus: true, expiresAt: true } },
              },
            },
          },
        },
        _count: { select: { tickets: true, ticketRequests: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');
    const counts = await this.prisma.ticketRequest.groupBy({
      by: ['approvalStatus'],
      where: { eventId: id },
      _count: { _all: true },
    });

    return {
      ...event,
      statusCounts: counts.reduce<Record<string, number>>((acc, row) => {
        acc[row.approvalStatus] = row._count._all;
        return acc;
      }, {}),
    };
  }

  async registerForEvent(eventId: string, dto: RegisterForEventDto) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        title: true,
        ticketPrice: true,
         capacity: true,
        registrationFields: true,
      },
    });
    if (!event) throw new NotFoundException('Event not found or not published');

    const ticketQuantity = Math.max(1, Math.floor(Number(dto.ticketQuantity ?? 1)));
    this.validateRegistrationFields(event.registrationFields, dto.answers ?? {});
    await this.assertCapacity(event.id, event.capacity, ticketQuantity);

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const requestNumber = await this.nextNumber('REQ');

    const request = await this.prisma.ticketRequest.create({
      data: {
        requestNumber,
        eventId: event.id,
        userId: user?.id,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        cnic: dto.cnic,
        city: dto.city,
        organization: dto.organization,
        designation: dto.designation,
        answers: dto.answers ? (dto.answers as Prisma.InputJsonValue) : Prisma.JsonNull,
        paymentAmount: event.ticketPrice * ticketQuantity,
        ticketQuantity,
        paymentProvider: event.ticketPrice > 0 ? 'SQUARE' : null,
        paymentStatus: event.ticketPrice > 0 ? 'PENDING' : 'NOT_REQUIRED',
        approvalStatus: event.ticketPrice > 0 ? 'PENDING_PAYMENT' : 'AWAITING_ADMIN_CONFIRMATION',
      },
    });

    if (event.ticketPrice === 0) {
      await this.sendPaymentReceivedEmails(request.id);
      return {
        requestId: request.id,
        requestNumber: request.requestNumber,
        ticketQuantity: request.ticketQuantity,
        totalAmount: request.paymentAmount,
        paymentRequired: false,
        message: 'Registration received. Awaiting admin approval.',
      };
    }

    const order = await this.createSquareCheckout(event, request);
    await this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: {
        squarePaymentLinkId: order.paymentLinkId,
        squareOrderId: order.orderId,
        paymentStatus: 'ORDER_CREATED',
      },
    });

    return {
      requestId: request.id,
      requestNumber: request.requestNumber,
      ticketQuantity: request.ticketQuantity,
      totalAmount: request.paymentAmount,
      paymentRequired: true,
      orderId: order.orderId,
      checkoutUrl: order.checkoutUrl,
      approveUrl: order.checkoutUrl,
    };
  }

  async verifyEventPayment(dto: VerifyEventPaymentDto) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id: dto.requestId },
      include: { event: true },
    });
    if (!request?.squareOrderId) throw new BadRequestException('This ticket request does not have a Square order.');

    if (request.paidAt) {
      return { message: 'Payment already received. Awaiting approval.', data: request };
    }

    await this.squareService.verifyOrderPaid(request.squareOrderId, {
      amount: request.paymentAmount,
      referenceId: this.eventReferenceId(request.id),
    });
    await this.markEventRequestPaid(request.id);
    await this.sendPaymentReceivedEmails(request.id);

    return { message: 'Payment received. Awaiting admin approval.' };
  }

  async payEventWithSquareToken(dto: SquareEventTokenPaymentDto) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id: dto.requestId },
      include: { event: true },
    });
    if (!request) throw new NotFoundException('Ticket request not found');
    if (request.paymentAmount <= 0) throw new BadRequestException('This ticket does not require payment.');

    if (request.paidAt) {
      return { message: 'Payment already received. Awaiting approval.', data: request };
    }

    const payment = await this.squareService.createPayment({
      sourceId: dto.sourceId,
      idempotencyKey: dto.idempotencyKey ?? crypto.randomUUID(),
      amount: request.paymentAmount,
      referenceId: this.eventReferenceId(request.id),
      note: `${request.event.title} APPNA NC Event Ticket`,
    });

    await this.markEventRequestPaid(request.id, payment.paymentId);
    await this.sendPaymentReceivedEmails(request.id);

    return {
      message: 'Payment received. Awaiting admin approval.',
      data: {
        requestId: request.id,
        paymentStatus: 'PAID',
        approvalStatus: 'AWAITING_ADMIN_CONFIRMATION',
        receiptUrl: payment.receiptUrl,
      },
    };
  }

  async handleSquareWebhook(
    headers: Record<string, string | string[] | undefined>,
    body: any,
    rawBody?: Buffer,
  ) {
    this.squareService.verifyWebhookSignature(headers, rawBody);
    const payment = this.squareService.paymentFromWebhook(body);
    const orderId = payment?.order_id;
    if (!orderId) return { received: true, ignored: true };

    const request = await this.prisma.ticketRequest.findUnique({ where: { squareOrderId: orderId } });
    if (!request || request.paidAt) return { received: true, ignored: true };

    if (body?.type === 'payment.created' || body?.type === 'payment.updated') {
      const verified = this.squareService.assertPaymentMatches(payment, {
        orderId,
        amount: request.paymentAmount,
      });
      await this.markEventRequestPaid(request.id, verified.paymentId);
      await this.sendPaymentReceivedEmails(request.id);
    }

    return { received: true };
  }

  async listRequests(status?: string, search?: string) {
    return this.prisma.ticketRequest.findMany({
      where: {
        ...(status && status !== 'ALL' ? { approvalStatus: status as TicketRequestStatus } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search } },
                { email: { contains: search } },
                { requestNumber: { contains: search } },
              { tickets: { some: { ticketNumber: { contains: search } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: true,
        tickets: { orderBy: { ticketIndex: 'asc' } },
        user: { select: { membership: { select: { isActive: true, type: true, paymentStatus: true } } } },
      },
    });
  }

  async approveRequest(id: string, actorId: string, notes?: string) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id },
      include: { event: true, tickets: { orderBy: { ticketIndex: 'asc' } } },
    });
    if (!request) throw new NotFoundException('Ticket request not found');
    if (request.paymentStatus !== 'PAID' && request.paymentStatus !== 'NOT_REQUIRED') {
      throw new BadRequestException('Payment must be verified before approval.');
    }
    if (request.approvalStatus === 'REJECTED' || request.approvalStatus === 'CANCELLED') {
      throw new BadRequestException('This request is not eligible for approval.');
    }
    if (request.tickets.length) return request.tickets;

    const ticketQuantity = Math.max(1, request.ticketQuantity ?? 1);
    const generatedTickets = await Promise.all(
      Array.from({ length: ticketQuantity }, async (_, index) => {
        const ticketIndex = index + 1;
        const ticketId = crypto.randomUUID();
        const qrSecret = crypto.randomBytes(32).toString('base64url');
        const ticketNumber = await this.nextNumber('TKT');
        const registrationNumber = await this.nextNumber('REG');
        const payload = this.signQrPayload({
          ticketId,
          eventId: request.eventId,
          requestId: request.id,
          ticketIndex: String(ticketIndex),
          userId: request.userId ?? request.id,
          validationToken: qrSecret,
        });
        const qrPayloadHash = this.hash(payload);
        const qrCodeDataUrl = await QRCode.toDataURL(payload, {
          errorCorrectionLevel: 'M',
          margin: 1,
          scale: 8,
        });
        const ticketImageDataUrl = buildTicketCardPng({
          ticketNumber,
          registrationNumber,
          ticketIndex,
          ticketQuantity,
          attendeeName: request.fullName,
          eventName: request.event.title,
          eventDate: request.event.date,
          eventTime: `${request.event.startTime} - ${request.event.endTime}`,
          venue: request.event.venue,
          qrPayload: payload,
        });

        return {
          id: ticketId,
          ticketIndex,
          ticketNumber,
          registrationNumber,
          requestId: id,
          eventId: request.eventId,
          userId: request.userId,
          attendeeName: request.fullName,
          attendeeEmail: request.email,
          qrPayloadHash,
          qrSecret,
          qrCodeDataUrl,
          ticketImageDataUrl,
        };
      }),
    );

    const tickets = await this.prisma.$transaction(async (tx) => {
      await tx.ticketRequest.update({
        where: { id },
        data: {
          approvalStatus: 'CONFIRMED',
          adminNotes: notes,
          reviewedById: actorId,
          reviewedAt: new Date(),
        },
      });

      await tx.ticket.createMany({
        data: generatedTickets,
      });

      return tx.ticket.findMany({
        where: { requestId: id },
        orderBy: { ticketIndex: 'asc' },
        include: { event: true, request: true },
      });
    });

    await this.audit(request.eventId, actorId, 'TICKET_REQUEST_APPROVED', {
      requestId: id,
      ticketQuantity,
      ticketNumbers: tickets.map((ticket) => ticket.ticketNumber),
    });
    await this.mailService.sendTicketApproved({
      attendeeName: request.fullName,
      attendeeEmail: request.email,
      eventName: request.event.title,
      eventDate: request.event.date,
      eventTime: `${request.event.startTime} - ${request.event.endTime}`,
      eventLocation: request.event.venue,
      tickets: tickets.map((ticket) => ({
        ticketNumber: ticket.ticketNumber,
        registrationNumber: ticket.registrationNumber,
        ticketImageDataUrl: ticket.ticketImageDataUrl,
      })),
      ticketAccessUrl: this.frontendUrl(`/tickets`),
    });
    await this.createUserNotification(request.userId, {
      type: 'TICKET_APPROVED',
      title: ticketQuantity > 1 ? 'Your event tickets have been approved' : 'Your event ticket has been approved',
      message: `${request.event.title} is confirmed. ${ticketQuantity} ${ticketQuantity > 1 ? 'tickets are' : 'ticket is'} ready in your portal.`,
      metadata: {
        requestId: id,
        eventId: request.eventId,
        ticketQuantity,
        ticketIds: tickets.map((ticket) => ticket.id),
        ticketNumbers: tickets.map((ticket) => ticket.ticketNumber),
      },
    });

    return tickets;
  }

  async rejectRequest(id: string, actorId: string, notes?: string) {
    const request = await this.prisma.ticketRequest.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        adminNotes: notes,
        reviewedById: actorId,
        reviewedAt: new Date(),
      },
      include: { event: true },
    });

    await this.audit(request.eventId, actorId, 'TICKET_REQUEST_REJECTED', { requestId: id });
    await this.mailService.sendTicketRejected({
      attendeeName: request.fullName,
      attendeeEmail: request.email,
      eventName: request.event.title,
      notes,
    });
    await this.createUserNotification(request.userId, {
      type: 'TICKET_REJECTED',
      title: 'Ticket request rejected',
      message: notes
        ? `${request.event.title} was rejected: ${notes}`
        : `${request.event.title} was not approved.`,
      metadata: { requestId: id, eventId: request.eventId },
    });
    return request;
  }

  async getMyTickets(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const requests = await this.prisma.ticketRequest.findMany({
      where: {
        OR: [
          { userId },
          { email: user.email },
        ],
      },
      orderBy: { createdAt: 'desc' },
      include: { event: true, tickets: { orderBy: { ticketIndex: 'asc' } } },
    });

    return requests.flatMap((request) => {
      if (request.tickets.length) {
        return request.tickets.map((ticket) => this.toTicketPortalRecord(request, ticket));
      }
      return [this.toTicketPortalRecord(request)];
    });
  }

  async validateTicket(qrPayload: string, actorId: string, ipAddress?: string, markUsed = true) {
    const decoded = this.verifyQrPayload(qrPayload);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: decoded.ticketId },
      include: { event: true, request: true },
    });

    if (!ticket || ticket.qrPayloadHash !== this.hash(qrPayload) || ticket.eventId !== decoded.eventId) {
      return { status: 'Invalid', valid: false };
    }

    if (ticket.status === 'USED') {
      await this.recordScan(ticket.id, actorId, 'Already Checked In', ipAddress);
      return this.validationResponse(ticket, 'Already Checked In', false);
    }

    if (ticket.status !== 'VALID') {
      await this.recordScan(ticket.id, actorId, 'Invalid', ipAddress);
      return this.validationResponse(ticket, 'Invalid', false);
    }

    if (ticket.event.status === 'COMPLETED' || ticket.event.status === 'CANCELLED') {
      await this.recordScan(ticket.id, actorId, 'Expired', ipAddress);
      return this.validationResponse(ticket, 'Expired', false);
    }

    if (markUsed) {
      const updated = await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'USED', usedAt: new Date(), checkedInById: actorId },
        include: { event: true, request: true },
      });
      await this.recordScan(ticket.id, actorId, 'Valid', ipAddress);
      return this.validationResponse(updated, 'Valid', true);
    }

    return this.validationResponse(ticket, 'Valid', true);
  }

  async listMyNotifications(userId: string) {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          OR: [
            { userId },
            { audience: 'USER', userId: null },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.notification.count({
        where: {
          OR: [
            { userId },
            { audience: 'USER', userId: null },
          ],
          readAt: null,
        },
      }),
    ]);

    return { items, unreadCount };
  }

  async listAdminNotifications() {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { audience: 'ADMIN' },
        orderBy: { createdAt: 'desc' },
        take: 75,
      }),
      this.prisma.notification.count({
        where: { audience: 'ADMIN', readAt: null },
      }),
    ]);

    return { items, unreadCount };
  }

  async getAnalytics() {
    const [
      totalEvents,
      totalRegistrations,
      totalApprovedTickets,
      paidRequests,
      upcomingEvents,
      recentTicketRequests,
      usedTickets,
    ] = await Promise.all([
      this.prisma.event.count(),
      this.prisma.ticketRequest.count(),
      this.prisma.ticket.count({ where: { status: { in: ['VALID', 'USED'] } } }),
      this.prisma.ticketRequest.findMany({ where: { paymentStatus: 'PAID' }, select: { paymentAmount: true } }),
      this.prisma.event.findMany({ where: { date: { gte: new Date() }, status: 'PUBLISHED' }, take: 5, orderBy: { date: 'asc' } }),
      this.prisma.ticketRequest.findMany({ take: 8, orderBy: { createdAt: 'desc' }, include: { event: true } }),
      this.prisma.ticket.count({ where: { status: 'USED' } }),
    ]);

    return {
      totalEvents,
      totalRegistrations,
      totalApprovedTickets,
      totalRevenue: paidRequests.reduce((sum, item) => sum + item.paymentAmount, 0),
      upcomingEvents,
      recentTicketRequests,
      attendance: {
        usedTickets,
        issuedTickets: totalApprovedTickets,
        attendanceRate: totalApprovedTickets ? Math.round((usedTickets / totalApprovedTickets) * 100) : 0,
      },
    };
  }

  private async markEventRequestPaid(requestId: string, squarePaymentId?: string | null) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Ticket request not found');

    return this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: {
        squarePaymentId: squarePaymentId ?? request.squarePaymentId,
        paidAt: new Date(),
        paymentStatus: 'PAID',
        approvalStatus: 'AWAITING_ADMIN_CONFIRMATION',
      },
    });
  }

  private async createSquareCheckout(
    event: { id: string; slug?: string; title: string; ticketPrice: number },
    request: { id: string; email?: string | null; phone?: string | null; paymentAmount: number; ticketQuantity: number },
  ) {
    const returnUrl = this.frontendUrl(`/events/payment/return?requestId=${request.id}`);
    return this.squareService.createPaymentLink({
      idempotencyKey: `event-${request.id}`,
      name: request.ticketQuantity > 1
        ? `${event.title} Event Tickets (${request.ticketQuantity})`
        : `${event.title} Event Ticket`,
      amount: request.paymentAmount,
      referenceId: this.eventReferenceId(request.id),
      redirectUrl: returnUrl,
      buyerEmail: request.email ?? undefined,
      buyerPhone: request.phone ?? undefined,
      paymentNote: `${event.title} APPNA NC Event Ticket x ${request.ticketQuantity}`,
    });
  }

  private normalizeFields(fields?: RegistrationFieldDto[]) {
    return (fields?.length
      ? fields
      : [
          { key: 'fullName', label: 'Full Name', type: 'TEXT', required: true, position: 0 },
          { key: 'email', label: 'Email Address', type: 'EMAIL', required: true, position: 1 },
          { key: 'phone', label: 'Phone Number', type: 'PHONE', required: true, position: 2 },
          { key: 'city', label: 'City', type: 'TEXT', required: false, position: 3 },
        ]).map((field, index) => ({
      key: this.slugify(field.key).replace(/-/g, '_'),
      label: field.label,
      type: field.type,
      required: !!field.required,
      options: field.options ?? Prisma.JsonNull,
      position: field.position ?? index,
    }));
  }

  private validateRegistrationFields(fields: Array<{ key: string; label: string; required: boolean }>, answers: Record<string, unknown>) {
    for (const field of fields) {
      if (['fullName', 'email', 'phone'].includes(field.key)) continue;
      if (field.required && !answers[field.key]) {
        throw new BadRequestException(`${field.label} is required.`);
      }
    }
  }

  private async assertCapacity(eventId: string, capacity: number, requestedQuantity = 1) {
    const reserved = await this.prisma.ticketRequest.aggregate({
      where: {
        eventId,
        approvalStatus: { not: 'REJECTED' },
        paymentStatus: { in: ['ORDER_CREATED', 'PAID', 'NOT_REQUIRED'] },
      },
      _sum: { ticketQuantity: true },
    });
    const reservedQuantity = reserved._sum.ticketQuantity ?? 0;
    if (reservedQuantity + requestedQuantity > capacity) {
      const remaining = Math.max(0, capacity - reservedQuantity);
      throw new BadRequestException(
        remaining
          ? `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining for this event.`
          : 'This event is sold out.',
      );
    }
  }

  private async sendPaymentReceivedEmails(requestId: string) {
    const request = await this.prisma.ticketRequest.findUnique({ where: { id: requestId }, include: { event: true } });
    if (!request) return;
    await this.mailService.sendEventPaymentReceived({
      attendeeName: request.fullName,
      attendeeEmail: request.email,
      eventName: request.event.title,
      amount: request.paymentAmount,
      paymentProvider: request.paymentProvider,
      paymentOrderId: request.squareOrderId ?? request.paypalOrderId,
      paymentTransactionId: request.squarePaymentId ?? request.paypalCaptureId,
      reviewUrl: this.frontendUrl('/admin/events'),
    });
    await Promise.all([
      this.createUserNotification(request.userId, {
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        message: `${request.event.title} payment was received. Your ticket request is waiting for admin approval.`,
        metadata: { requestId: request.id, eventId: request.eventId },
      }),
      this.createAdminNotification({
        type: 'APPROVAL_REQUIRED',
        title: 'New event registration waiting for approval',
        message: `${request.fullName} registered for ${request.event.title}.`,
        metadata: {
          requestId: request.id,
          eventId: request.eventId,
          email: request.email,
          amount: request.paymentAmount,
          transactionId: request.squarePaymentId ?? request.squareOrderId ?? request.paypalCaptureId ?? request.paypalOrderId,
        },
      }),
    ]);
  }

  private eventReferenceId(requestId: string) {
    return `ticket_${requestId}`;
  }

  private signQrPayload(payload: Record<string, string>) {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.qrSigningSecret()).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verifyQrPayload(value: string): { ticketId: string; eventId: string; userId: string; validationToken: string } {
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) throw new BadRequestException('Invalid QR payload');
    const expected = crypto.createHmac('sha256', this.qrSigningSecret()).update(encoded).digest('base64url');
    if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) {
      throw new BadRequestException('Invalid QR signature');
    }
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new BadRequestException('Invalid QR signature');
    }
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!decoded.ticketId || !decoded.eventId || !decoded.userId || !decoded.validationToken) {
      throw new BadRequestException('Invalid QR payload');
    }
    return decoded;
  }

  private qrSigningSecret() {
    return process.env.QR_SIGNING_SECRET ?? process.env.JWT_SECRET ?? 'appna-nc-dev-qr-secret';
  }

  private hash(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  private validationResponse(ticket: any, status: string, valid: boolean) {
    return {
      valid,
      status,
      ticketId: ticket.ticketNumber,
      holderName: ticket.attendeeName,
      eventName: ticket.event.title,
      ticketStatus: ticket.status,
      approvalStatus: ticket.request?.approvalStatus,
      usedAt: ticket.usedAt,
      checkInTime: ticket.usedAt,
    };
  }

  private toTicketPortalRecord(request: any, ticket?: any) {
    const status = this.portalStatus(request, ticket);
    return {
      id: ticket?.id ?? request.id,
      requestId: request.id,
      requestNumber: request.requestNumber,
      ticketQuantity: request.ticketQuantity ?? 1,
      ticketIndex: ticket?.ticketIndex ?? null,
      ticketNumber: ticket?.ticketNumber ?? request.requestNumber,
      registrationNumber: ticket?.registrationNumber ?? null,
      status,
      paymentStatus: request.paymentStatus,
      approvalStatus: request.approvalStatus,
      attendeeName: ticket?.attendeeName ?? request.fullName,
      attendeeEmail: ticket?.attendeeEmail ?? request.email,
      qrCodeDataUrl: ticket?.qrCodeDataUrl ?? null,
      ticketImageDataUrl: ticket?.ticketImageDataUrl ?? null,
      issueDate: ticket?.issueDate ?? null,
      purchaseDate: request.paidAt ?? request.createdAt,
      createdAt: request.createdAt,
      usedAt: ticket?.usedAt ?? null,
      event: request.event,
      adminNotes: request.adminNotes,
    };
  }

  private portalStatus(request: any, ticket?: any) {
    if (request.approvalStatus === 'CONFIRMED') {
      if (ticket?.status === 'USED') return 'Checked In';
      if (ticket?.status === 'EXPIRED') return 'Expired';
      return 'Confirmed';
    }
    if (request.approvalStatus === 'REJECTED') return 'Rejected';
    if (request.approvalStatus === 'CANCELLED') return 'Cancelled';
    if (request.approvalStatus === 'EXPIRED') return 'Expired';
    if (request.paymentStatus === 'PAID' || request.paymentStatus === 'NOT_REQUIRED') {
      return 'Awaiting Admin Confirmation';
    }
    if (request.paymentStatus === 'ORDER_CREATED' || request.paymentStatus === 'PENDING') return 'Pending Payment';
    if (request.paymentStatus === 'FAILED') return 'Payment Failed';
    return request.approvalStatus;
  }

  private async createUserNotification(
    userId: string | null | undefined,
    input: { type: NotificationType; title: string; message: string; metadata?: Record<string, unknown> },
  ) {
    if (!userId) return;
    await this.prisma.notification.create({
      data: {
        userId,
        audience: 'USER',
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  private async createAdminNotification(input: {
    type: NotificationType;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
  }) {
    await this.prisma.notification.create({
      data: {
        audience: 'ADMIN',
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: input.metadata ? (input.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });
  }

  private async recordScan(ticketId: string, actorId: string, result: string, ipAddress?: string) {
    await this.prisma.ticketCheckIn.create({
      data: { ticketId, checkedInBy: actorId, result, ipAddress },
    });
  }

  private async ensureEvent(id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async uniqueSlug(title: string, excludeId?: string) {
    const base = this.slugify(title);
    let slug = base;
    let counter = 2;
    while (await this.prisma.event.findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })) {
      slug = `${base}-${counter++}`;
    }
    return slug;
  }

  private slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'event';
  }

  private async nextNumber(prefix: string) {
    return `${prefix}-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private async audit(eventId: string | null, actorId: string | null, action: string, metadata: Record<string, unknown>) {
    await this.prisma.eventAuditLog.create({
      data: { eventId, actorId, action, metadata: metadata as Prisma.InputJsonValue },
    });
  }

  private frontendUrl(path: string) {
    return `${(process.env.FRONTEND_URL ?? 'https://appnanc.org').replace(/\/$/, '')}${path}`;
  }

  private xml(value: string) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
