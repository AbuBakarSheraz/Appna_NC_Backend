import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';

type Money = {
  amount?: number;
  currency?: string;
};

type SquarePaymentLinkResponse = {
  payment_link?: {
    id?: string;
    order_id?: string;
    url?: string;
    long_url?: string;
  };
  errors?: unknown[];
};

type SquareOrderResponse = {
  order?: {
    id?: string;
    location_id?: string;
    reference_id?: string;
    state?: string;
    total_money?: Money;
    net_amounts?: { total_money?: Money };
  };
  errors?: unknown[];
};

type SquarePayment = {
  id?: string;
  order_id?: string;
  location_id?: string;
  status?: string;
  amount_money?: Money;
  total_money?: Money;
  receipt_url?: string;
  source_type?: string;
};

type SquareCreatePaymentResponse = {
  payment?: SquarePayment;
  errors?: unknown[];
};

@Injectable()
export class SquareService {
  private readonly logger = new Logger(SquareService.name);

  async createPaymentLink(input: {
    idempotencyKey: string;
    name: string;
    amount: number;
    referenceId: string;
    redirectUrl: string;
    buyerEmail?: string;
    buyerPhone?: string | null;
    paymentNote?: string;
  }) {
    const amountCents = this.toCents(input.amount);

    const response = await this.request<SquarePaymentLinkResponse>('/v2/online-checkout/payment-links', {
      method: 'POST',
      body: JSON.stringify({
        idempotency_key: input.idempotencyKey,
        description: input.paymentNote,
        order: {
          location_id: this.locationId(),
          reference_id: input.referenceId,
          line_items: [
            {
              name: input.name,
              quantity: '1',
              base_price_money: {
                amount: amountCents,
                currency: 'USD',
              },
            },
          ],
        },
        checkout_options: {
          redirect_url: input.redirectUrl,
          ask_for_shipping_address: false,
        },
        pre_populated_data: {
          buyer_email: input.buyerEmail,
          buyer_phone_number: input.buyerPhone || undefined,
        },
        payment_note: input.paymentNote,
      }),
    });

    const link = response.payment_link;
    if (!link?.url || !link.order_id || !link.id) {
      this.logger.error('Square did not return a usable payment link', response);
      throw new InternalServerErrorException('Square checkout did not return a payment link.');
    }

    return {
      paymentLinkId: link.id,
      orderId: link.order_id,
      checkoutUrl: link.url,
    };
  }

  async verifyOrderPaid(orderId: string, expected: { amount: number; referenceId: string }) {
    if (!orderId) throw new BadRequestException('Missing Square order ID.');

    const response = await this.request<SquareOrderResponse>(`/v2/orders/${encodeURIComponent(orderId)}`, {
      method: 'GET',
    });
    const order = response.order;

    if (!order) throw new BadRequestException('Square order was not found.');
    if (order.location_id !== this.locationId()) {
      throw new ForbiddenException('Square order belongs to a different location.');
    }
    if (order.reference_id !== expected.referenceId) {
      throw new BadRequestException('Square order does not match this request.');
    }

    const paidCents = order.total_money?.amount ?? order.net_amounts?.total_money?.amount ?? 0;
    if (paidCents !== this.toCents(expected.amount)) {
      throw new BadRequestException('Square payment amount does not match the expected amount.');
    }
    if (order.state !== 'COMPLETED') {
      throw new BadRequestException('Square payment has not completed yet.');
    }

    return { orderId: order.id ?? orderId, state: order.state, amountCents: paidCents };
  }

  async createPayment(input: {
    sourceId: string;
    idempotencyKey: string;
    amount: number;
    referenceId: string;
    note?: string;
  }) {
    if (!input.sourceId) throw new BadRequestException('Missing Square payment source.');

    const response = await this.request<SquareCreatePaymentResponse>('/v2/payments', {
      method: 'POST',
      body: JSON.stringify({
        source_id: input.sourceId,
        idempotency_key: input.idempotencyKey,
        amount_money: {
          amount: this.toCents(input.amount),
          currency: 'USD',
        },
        autocomplete: true,
        location_id: this.locationId(),
        reference_id: input.referenceId,
        note: input.note,
      }),
    });

    const payment = response.payment;
    if (!payment?.id) {
      this.logger.error('Square did not return a usable payment', response);
      throw new InternalServerErrorException('Square payment did not complete.');
    }

    const paidCents = payment.total_money?.amount ?? payment.amount_money?.amount ?? 0;
    if (payment.location_id !== this.locationId()) {
      throw new ForbiddenException('Square payment belongs to a different location.');
    }
    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Square payment has not completed yet.');
    }
    if (paidCents !== this.toCents(input.amount)) {
      throw new BadRequestException('Square payment amount does not match the expected amount.');
    }

    return {
      paymentId: payment.id,
      orderId: payment.order_id ?? null,
      amountCents: paidCents,
      receiptUrl: payment.receipt_url ?? null,
      sourceType: payment.source_type ?? null,
    };
  }

  paymentFromWebhook(body: any): SquarePayment | null {
    const payment = body?.data?.object?.payment;
    return payment && typeof payment === 'object' ? payment : null;
  }

  assertPaymentMatches(payment: SquarePayment, expected: { orderId: string; amount: number }) {
    if (payment.location_id !== this.locationId()) {
      throw new ForbiddenException('Square payment belongs to a different location.');
    }
    if (payment.order_id !== expected.orderId) {
      throw new BadRequestException('Square payment does not match this order.');
    }
    if (payment.status !== 'COMPLETED') {
      throw new BadRequestException('Square payment has not completed yet.');
    }

    const paidCents = payment.total_money?.amount ?? payment.amount_money?.amount ?? 0;
    if (paidCents !== this.toCents(expected.amount)) {
      throw new BadRequestException('Square payment amount does not match the expected amount.');
    }

    return {
      paymentId: payment.id ?? null,
      orderId: payment.order_id ?? expected.orderId,
      amountCents: paidCents,
    };
  }

  verifyWebhookSignature(headers: Record<string, string | string[] | undefined>, rawBody?: Buffer | string) {
    const signatureKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    const notificationUrl = process.env.SQUARE_WEBHOOK_URL;
    if (!signatureKey || !notificationUrl) {
      throw new InternalServerErrorException('Square webhook signature verification is not configured.');
    }

    const signatureHeader = this.pickHeader(headers, 'x-square-hmacsha256-signature');
    if (!signatureHeader || !rawBody) {
      throw new ForbiddenException('Square webhook signature is missing.');
    }

    const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expected = crypto
      .createHmac('sha256', signatureKey)
      .update(notificationUrl + body)
      .digest('base64');

    const receivedBuffer = Buffer.from(signatureHeader);
    const expectedBuffer = Buffer.from(expected);
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Square webhook signature could not be verified.');
    }
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'Square-Version': process.env.SQUARE_API_VERSION ?? '2026-05-20',
        Authorization: `Bearer ${this.accessToken()}`,
        ...(init.headers ?? {}),
      },
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.logger.error(`Square request failed: ${response.status}`, json);
      throw new InternalServerErrorException('Square payment service is unavailable.');
    }

    return json as T;
  }

  private baseUrl() {
    return process.env.SQUARE_ENVIRONMENT === 'production'
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';
  }

  private accessToken() {
    const token = process.env.SQUARE_ACCESS_TOKEN;
    if (!token) throw new InternalServerErrorException('Square access token is not configured.');
    return token;
  }

  private locationId() {
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId) throw new InternalServerErrorException('Square location ID is not configured.');
    return locationId;
  }

  private toCents(amount: number) {
    return Math.round(Number(amount) * 100);
  }

  private pickHeader(headers: Record<string, string | string[] | undefined>, key: string) {
    const value = headers[key] ?? headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
