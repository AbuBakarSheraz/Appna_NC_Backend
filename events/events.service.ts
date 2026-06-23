import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, TicketRequestStatus } from '@prisma/client';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import {
  CaptureEventPaymentDto,
  CreateEventDto,
  RegisterForEventDto,
  RegistrationFieldDto,
  UpdateEventDto,
} from './dto/event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private paypalAccessToken?: string;
  private paypalAccessTokenExpiresAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
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
              { ticket: { is: { ticketNumber: { contains: search } } } },
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
            ticket: true,
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

    this.validateRegistrationFields(event.registrationFields, dto.answers ?? {});
    await this.assertCapacity(event.id, event.capacity);

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
        paymentAmount: event.ticketPrice,
        paymentProvider: event.ticketPrice > 0 ? 'PAYPAL' : null,
        paymentStatus: event.ticketPrice > 0 ? 'PENDING' : 'NOT_REQUIRED',
        approvalStatus: event.ticketPrice > 0 ? 'PENDING_PAYMENT' : 'AWAITING_ADMIN_CONFIRMATION',
      },
    });

    if (event.ticketPrice === 0) {
      await this.sendPaymentReceivedEmails(request.id);
      return {
        requestId: request.id,
        requestNumber: request.requestNumber,
        paymentRequired: false,
        message: 'Registration received. Awaiting admin approval.',
      };
    }

    const order = await this.createPayPalOrder(event, request);
    await this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: { paypalOrderId: order.orderId, paymentStatus: 'ORDER_CREATED' },
    });

    return {
      requestId: request.id,
      requestNumber: request.requestNumber,
      paymentRequired: true,
      orderId: order.orderId,
      approveUrl: order.approveUrl,
    };
  }

  async captureEventPayment(dto: CaptureEventPaymentDto) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id: dto.requestId },
      include: { event: true },
    });
    if (!request || request.paypalOrderId !== dto.orderId) {
      throw new BadRequestException('This PayPal order does not match the ticket request.');
    }

    if (request.paidAt) {
      return { message: 'Payment already received. Awaiting approval.', data: request };
    }

    const capture = await this.paypalRequest<any>(`/v2/checkout/orders/${dto.orderId}/capture`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await this.markPaidFromPayPalCapture(request.id, capture);
    await this.sendPaymentReceivedEmails(request.id);

    return { message: 'Payment received. Awaiting admin approval.' };
  }

  async handlePayPalWebhook(headers: Record<string, string | string[] | undefined>, body: any) {
    const verified = await this.verifyPayPalWebhook(headers, body);
    if (!verified) throw new ForbiddenException('PayPal webhook signature could not be verified.');

    const eventType = body?.event_type;
    const orderId =
      body?.resource?.supplementary_data?.related_ids?.order_id ??
      body?.resource?.id;

    if (!orderId) return { received: true, ignored: true };

    const request = await this.prisma.ticketRequest.findUnique({ where: { paypalOrderId: orderId } });
    if (!request || request.paidAt) return { received: true, ignored: true };

    if (eventType === 'CHECKOUT.ORDER.APPROVED' || eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const order = await this.paypalRequest<any>(`/v2/checkout/orders/${request.paypalOrderId}`, { method: 'GET' });
      await this.markPaidFromPayPalCapture(request.id, order);
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
                { ticket: { is: { ticketNumber: { contains: search } } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: true,
        ticket: true,
        user: { select: { membership: { select: { isActive: true, type: true, paymentStatus: true } } } },
      },
    });
  }

  async approveRequest(id: string, actorId: string, notes?: string) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id },
      include: { event: true, ticket: true },
    });
    if (!request) throw new NotFoundException('Ticket request not found');
    if (request.paymentStatus !== 'PAID' && request.paymentStatus !== 'NOT_REQUIRED') {
      throw new BadRequestException('Payment must be verified before approval.');
    }
    if (request.approvalStatus === 'REJECTED' || request.approvalStatus === 'CANCELLED') {
      throw new BadRequestException('This request is not eligible for approval.');
    }
    if (request.ticket) return request.ticket;

    const ticketId = crypto.randomUUID();
    const qrSecret = crypto.randomBytes(32).toString('base64url');
    const ticketNumber = await this.nextNumber('TKT');
    const registrationNumber = await this.nextNumber('REG');
    const payload = this.signQrPayload({
      ticketId,
      eventId: request.eventId,
      userId: request.userId ?? request.id,
      validationToken: qrSecret,
    });
    const qrPayloadHash = this.hash(payload);
    const qrCodeDataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      scale: 8,
    });
    const ticketImageDataUrl = this.buildTicketSvgDataUrl({
      ticketNumber,
      registrationNumber,
      attendeeName: request.fullName,
      eventName: request.event.title,
      eventDate: request.event.date,
      startTime: request.event.startTime,
      endTime: request.event.endTime,
      venue: request.event.venue,
      qrCodeDataUrl,
    });

    const ticket = await this.prisma.$transaction(async (tx) => {
      await tx.ticketRequest.update({
        where: { id },
        data: {
          approvalStatus: 'CONFIRMED',
          adminNotes: notes,
          reviewedById: actorId,
          reviewedAt: new Date(),
        },
      });

      return tx.ticket.create({
        data: {
          id: ticketId,
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
        },
        include: { event: true, request: true },
      });
    });

    await this.audit(request.eventId, actorId, 'TICKET_REQUEST_APPROVED', { requestId: id, ticketNumber });
    await this.mailService.sendTicketApproved({
      attendeeName: request.fullName,
      attendeeEmail: request.email,
      eventName: request.event.title,
      eventDate: request.event.date,
      eventTime: `${request.event.startTime} - ${request.event.endTime}`,
      eventLocation: request.event.venue,
      ticketNumber,
      registrationNumber,
      ticketImageDataUrl,
      ticketAccessUrl: this.frontendUrl(`/tickets`),
    });
    await this.createUserNotification(request.userId, {
      type: 'TICKET_APPROVED',
      title: 'Your event ticket has been approved',
      message: `${request.event.title} is confirmed. Ticket ${ticketNumber} is ready in your portal.`,
      metadata: { requestId: id, ticketId: ticket.id, eventId: request.eventId, ticketNumber },
    });

    return ticket;
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
      include: { event: true, ticket: true },
    });

    return requests.map((request) => this.toTicketPortalRecord(request));
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

  private async markPaidFromPayPalCapture(requestId: string, capture: any) {
    const request = await this.prisma.ticketRequest.findUnique({
      where: { id: requestId },
      include: { event: true },
    });
    if (!request) throw new NotFoundException('Ticket request not found');

    const captureStatus = capture?.status;
    const purchaseUnit = capture?.purchase_units?.[0];
    const payment = purchaseUnit?.payments?.captures?.[0] ?? capture?.resource;
    const paidAmount = Number(payment?.amount?.value ?? purchaseUnit?.amount?.value ?? 0);

    if (captureStatus && captureStatus !== 'COMPLETED') {
      throw new BadRequestException('PayPal payment was not completed.');
    }
    if (paidAmount !== request.paymentAmount) {
      throw new BadRequestException('PayPal payment amount does not match the ticket price.');
    }

    return this.prisma.ticketRequest.update({
      where: { id: request.id },
      data: {
        paypalCaptureId: payment?.id ?? request.paypalCaptureId,
        paidAt: new Date(),
        paymentStatus: 'PAID',
        approvalStatus: 'AWAITING_ADMIN_CONFIRMATION',
      },
    });
  }

  private async createPayPalOrder(event: { id: string; slug?: string; title: string; ticketPrice: number }, request: { id: string }) {
    const returnUrl = this.frontendUrl(`/events/payment/return?requestId=${request.id}`);
    const cancelUrl = this.frontendUrl(`/events/${event.slug ?? event.id}`);
    const order = await this.paypalRequest<{ id: string; links?: Array<{ href: string; rel: string }> }>('/v2/checkout/orders', {
      method: 'POST',
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: request.id,
            custom_id: request.id,
            description: `${event.title} APPNA NC Event Ticket`,
            amount: { currency_code: 'USD', value: event.ticketPrice.toFixed(2) },
          },
        ],
        application_context: {
          brand_name: 'APPNA North Carolina',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      }),
    });

    const approveUrl = order.links?.find((link) => ['payer-action', 'approve', 'approval_url'].includes(link.rel))?.href
      ?? order.links?.find((link) => link.rel !== 'self')?.href;
    if (!approveUrl) throw new InternalServerErrorException('PayPal did not return an approval URL.');
    return { orderId: order.id, approveUrl };
  }

  private async paypalRequest<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.getPayPalAccessToken();
    const response = await fetch(`${this.paypalBaseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.error(`PayPal request failed: ${response.status}`, json);
      throw new InternalServerErrorException('PayPal payment service is unavailable.');
    }
    return json as T;
  }

  private async getPayPalAccessToken(): Promise<string> {
    if (this.paypalAccessToken && Date.now() < this.paypalAccessTokenExpiresAt) return this.paypalAccessToken;

    const { clientId, clientSecret } = this.getPayPalCredentials();

    const response = await fetch(`${this.paypalBaseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.error(`PayPal token request failed: ${response.status}`, json);
      throw new InternalServerErrorException('PayPal credentials could not be verified.');
    }

    this.paypalAccessToken = json.access_token;
    this.paypalAccessTokenExpiresAt = Date.now() + Math.max((json.expires_in ?? 300) - 60, 60) * 1000;
    return this.paypalAccessToken!;
  }

  private getPayPalCredentials(): { clientId: string; clientSecret: string } {
    const env = process.env.PAYPAL_ENV === 'live' ? 'LIVE' : 'SANDBOX';
    const clientId = process.env.PAYPAL_CLIENT_ID ?? process.env[`PAYPAL_CLIENT_ID_${env}`];
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? process.env[`PAYPAL_CLIENT_SECRET_${env}`];

    if (!clientId || !clientSecret) {
      const missing = [
        !clientId ? `PAYPAL_CLIENT_ID or PAYPAL_CLIENT_ID_${env}` : null,
        !clientSecret ? `PAYPAL_CLIENT_SECRET or PAYPAL_CLIENT_SECRET_${env}` : null,
      ].filter(Boolean).join(' and ');

      throw new InternalServerErrorException(
        `PayPal credentials are not configured. Set ${missing}.`,
      );
    }

    return { clientId, clientSecret };
  }

  private paypalBaseUrl(): string {
    return process.env.PAYPAL_ENV === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  }

  private async verifyPayPalWebhook(headers: Record<string, string | string[] | undefined>, body: any) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) return false;

    const pick = (key: string) => {
      const value = headers[key] ?? headers[key.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };

    const response = await this.paypalRequest<{ verification_status: string }>('/v1/notifications/verify-webhook-signature', {
      method: 'POST',
      body: JSON.stringify({
        auth_algo: pick('paypal-auth-algo'),
        cert_url: pick('paypal-cert-url'),
        transmission_id: pick('paypal-transmission-id'),
        transmission_sig: pick('paypal-transmission-sig'),
        transmission_time: pick('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: body,
      }),
    });

    return response.verification_status === 'SUCCESS';
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

  private async assertCapacity(eventId: string, capacity: number) {
    const count = await this.prisma.ticketRequest.count({
      where: {
        eventId,
        approvalStatus: { not: 'REJECTED' },
        paymentStatus: { in: ['ORDER_CREATED', 'PAID', 'NOT_REQUIRED'] },
      },
    });
    if (count >= capacity) throw new BadRequestException('This event is sold out.');
  }

  private async sendPaymentReceivedEmails(requestId: string) {
    const request = await this.prisma.ticketRequest.findUnique({ where: { id: requestId }, include: { event: true } });
    if (!request) return;
    await this.mailService.sendEventPaymentReceived({
      attendeeName: request.fullName,
      attendeeEmail: request.email,
      eventName: request.event.title,
      amount: request.paymentAmount,
      paypalOrderId: request.paypalOrderId,
      paypalCaptureId: request.paypalCaptureId,
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
          transactionId: request.paypalCaptureId ?? request.paypalOrderId,
        },
      }),
    ]);
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

  private buildTicketSvgDataUrl(input: {
    ticketNumber: string;
    registrationNumber: string;
    attendeeName: string;
    eventName: string;
    eventDate: Date;
    startTime: string;
    endTime: string;
    venue: string;
    qrCodeDataUrl: string;
  }) {
    const eventDate = input.eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="680" viewBox="0 0 1200 680">
      <rect width="1200" height="680" rx="34" fill="#f8fafc"/>
      <rect x="36" y="36" width="1128" height="608" rx="28" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
      <rect x="36" y="36" width="1128" height="118" rx="28" fill="#7a1f3d"/>
      <text x="78" y="96" font-family="Arial" font-size="34" font-weight="700" fill="#ffffff">APPNA NC Event Ticket</text>
      <text x="78" y="130" font-family="Arial" font-size="18" fill="#fce7f3">${this.xml(input.ticketNumber)}</text>
      <image href="${input.qrCodeDataUrl}" x="820" y="210" width="260" height="260"/>
      <text x="78" y="235" font-family="Arial" font-size="44" font-weight="700" fill="#111827">${this.xml(input.eventName)}</text>
      <text x="78" y="298" font-family="Arial" font-size="28" fill="#374151">${this.xml(input.attendeeName)}</text>
      <text x="78" y="374" font-family="Arial" font-size="22" font-weight="700" fill="#7a1f3d">Date and Time</text>
      <text x="78" y="410" font-family="Arial" font-size="22" fill="#374151">${this.xml(eventDate)} | ${this.xml(input.startTime)} - ${this.xml(input.endTime)}</text>
      <text x="78" y="480" font-family="Arial" font-size="22" font-weight="700" fill="#7a1f3d">Location</text>
      <text x="78" y="516" font-family="Arial" font-size="22" fill="#374151">${this.xml(input.venue)}</text>
      <text x="78" y="586" font-family="Arial" font-size="20" fill="#6b7280">Registration: ${this.xml(input.registrationNumber)}</text>
      <text x="820" y="510" font-family="Arial" font-size="18" fill="#6b7280">Scan at check-in</text>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
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

  private toTicketPortalRecord(request: any) {
    const ticket = request.ticket;
    const status = this.portalStatus(request);
    return {
      id: ticket?.id ?? request.id,
      requestId: request.id,
      requestNumber: request.requestNumber,
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

  private portalStatus(request: any) {
    if (request.approvalStatus === 'CONFIRMED') {
      if (request.ticket?.status === 'USED') return 'Checked In';
      if (request.ticket?.status === 'EXPIRED') return 'Expired';
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
