import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { Resend } from 'resend';
import { ContactFormDto } from './dto/contact-form.dto';

const SENDER    = process.env.MAIL_FROM!;   // e.g. "APPNA North Carolina <noreply@mail.appnanc.org>"
const ORG_INBOX = process.env.MAIL_ORG!;    // appnanc@gmail.com (can stay Gmail — you're only changing the SEND side)

type ResendAttachment = { filename: string; content: string | Buffer };

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  onModuleInit() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  // ── low-level send wrapper, mirrors old transporter.sendMail() shape ──
  private async send(opts: {
    from?: string;
    to: string | string[];
    replyTo?: string;
    subject: string;
    html: string;
    attachments?: ResendAttachment[];
  }) {
    const { data, error } = await this.resend.emails.send({
      from: opts.from ?? SENDER,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      attachments: opts.attachments,
    });

    if (error) {
      this.logger.error(`Resend send failed: ${error.message}`);
      throw new InternalServerErrorException('Email delivery failed. Please try again later.');
    }

    return data;
  }

  async sendContactMails(dto: ContactFormDto): Promise<void> {
    try {
      await Promise.all([
        this.sendAcknowledgement(dto),
        this.sendLeadToOrg(dto),
      ]);
    } catch (err) {
      this.logger.error('Failed to send contact emails', err);
      throw new InternalServerErrorException(
        'Email delivery failed. Please try again later.',
      );
    }
  }

  async sendMembershipPaymentReceived(dto: {
    memberName: string;
    memberEmail: string;
    membershipType: string;
    amount: number;
    paymentProvider?: string | null;
    paymentOrderId?: string | null;
    paymentTransactionId?: string | null;
  }): Promise<void> {
    const submittedAt = this.formatEasternTime(new Date());

    await Promise.all([
      this.send({
        from: `APPNA NC Membership <${this.extractEmail(SENDER)}>`,
        to: ORG_INBOX,
        replyTo: dto.memberEmail,
        subject: `Membership payment received - ${dto.memberName}`,
        html: this.wrapEmail({
          title: 'Membership Payment Received',
          subtitle: submittedAt,
          body: `
            <h2>Payment is ready for admin confirmation</h2>
            <p><strong>${dto.memberName}</strong> has completed ${dto.paymentProvider ?? 'online'} payment for APPNA NC membership.</p>
            <div class="highlight">
              <strong>Member:</strong> ${dto.memberName}<br/>
              <strong>Email:</strong> <a href="mailto:${dto.memberEmail}">${dto.memberEmail}</a><br/>
              <strong>Plan:</strong> ${dto.membershipType}<br/>
              <strong>Amount:</strong> $${dto.amount} USD<br/>
              <strong>Payment Provider:</strong> ${dto.paymentProvider ?? 'N/A'}<br/>
              <strong>Payment Order ID:</strong> ${dto.paymentOrderId ?? 'N/A'}<br/>
              <strong>Payment Transaction ID:</strong> ${dto.paymentTransactionId ?? 'N/A'}
            </div>
            <p>Please verify the payment in Square and press <strong>Confirm Payment</strong> in the admin panel.</p>
          `,
        }),
      }),
      this.send({
        from: `APPNA NC Membership <${this.extractEmail(SENDER)}>`,
        to: dto.memberEmail,
        subject: 'We received your APPNA NC membership payment',
        html: this.wrapEmail({
          title: 'Payment Received',
          subtitle: 'APPNA North Carolina',
          body: `
            <h2>Hi ${dto.memberName},</h2>
            <p>Thank you. We received your payment for the <strong>${dto.membershipType}</strong> membership.</p>
            <div class="highlight">An APPNA NC admin will review your payment and send your membership confirmation within <strong>24 hours</strong>.</div>
            <p>Your login uses the email and password you created during registration. You will receive an activation email as soon as the admin confirms your membership.</p>
            <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
          `,
        }),
      }),
    ]);
  }

  async sendMembershipConfirmed(dto: {
    memberName: string;
    memberEmail: string;
    membershipType: string;
    loginUrl?: string;
    membershipCardDataUrl?: string | null;
  }): Promise<void> {
    await this.send({
      from: `APPNA NC Membership <${this.extractEmail(SENDER)}>`,
      to: dto.memberEmail,
      subject: 'Your APPNA NC membership is active',
      html: this.wrapEmail({
        title: 'Membership Confirmed',
        subtitle: 'APPNA North Carolina',
        body: `
          <h2>Hi ${dto.memberName},</h2>
          <p>Your <strong>${dto.membershipType}</strong> membership has been confirmed and your member portal access is now active.</p>
          <div class="highlight">
            <strong>Login email:</strong> ${dto.memberEmail}<br/>
            <strong>Password:</strong> the password you created during registration
          </div>
          <p>You can now sign in and access your membership dashboard.</p>
          ${dto.loginUrl ? `<p><a class="btn" href="${dto.loginUrl}">Open Member Login</a></p>` : ''}
          <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
        `,
      }),
      attachments: this.attachmentsFromDataUrls([
        dto.membershipCardDataUrl
          ? { dataUrl: dto.membershipCardDataUrl, filename: 'appna-nc-membership-card.png' }
          : null,
      ]),
    });
  }

  async sendMembershipExpired(dto: {
    memberName: string;
    memberEmail: string;
    membershipType: string;
    expiredAt: Date;
  }): Promise<void> {
    await this.send({
      from: `APPNA NC Membership <${this.extractEmail(SENDER)}>`,
      to: dto.memberEmail,
      subject: 'Your APPNA NC membership has expired',
      html: this.wrapEmail({
        title: 'Membership Expired',
        subtitle: 'APPNA North Carolina',
        body: `
          <h2>Hi ${dto.memberName},</h2>
          <p>Your <strong>${dto.membershipType}</strong> membership expired on <strong>${dto.expiredAt.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}</strong>.</p>
          <div class="highlight">Annual memberships expire on <strong>December 31</strong> each year. Please renew from your member portal to restore full access.</div>
          <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
        `,
      }),
    });
  }

  async sendEventPaymentReceived(dto: {
    attendeeName: string;
    attendeeEmail: string;
    eventName: string;
    amount: number;
    paymentProvider?: string | null;
    paymentOrderId?: string | null;
    paymentTransactionId?: string | null;
    reviewUrl?: string;
  }): Promise<void> {
    const submittedAt = this.formatEasternTime(new Date());

    await Promise.all([
      this.send({
        from: `APPNA NC Events <${this.extractEmail(SENDER)}>`,
        to: dto.attendeeEmail,
        subject: 'Payment Received - APPNA NC Event Registration',
        html: this.wrapEmail({
          title: 'Payment Received',
          subtitle: 'APPNA North Carolina Events',
          body: `
            <h2>Hi ${dto.attendeeName},</h2>
            <p>Your payment for <strong>${dto.eventName}</strong> was received successfully.</p>
            <div class="highlight">
              Your registration request has been submitted. Our team will verify your details, and ticket approval may take up to <strong>24 hours</strong>.
            </div>
            <p>You will receive another email once your ticket is approved.</p>
            <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
          `,
        }),
      }),
      this.send({
        from: `APPNA NC Events <${this.extractEmail(SENDER)}>`,
        to: ORG_INBOX,
        replyTo: dto.attendeeEmail,
        subject: 'New Event Registration Waiting for Approval',
        html: this.wrapEmail({
          title: 'New Event Registration',
          subtitle: submittedAt,
          body: `
            <h2>Registration awaiting review</h2>
            <div class="highlight">
              <strong>Event:</strong> ${dto.eventName}<br/>
              <strong>Attendee:</strong> ${dto.attendeeName}<br/>
              <strong>Email:</strong> <a href="mailto:${dto.attendeeEmail}">${dto.attendeeEmail}</a><br/>
              <strong>Amount:</strong> $${dto.amount} USD<br/>
              <strong>Payment Provider:</strong> ${dto.paymentProvider ?? 'N/A'}<br/>
              <strong>Payment Order ID:</strong> ${dto.paymentOrderId ?? 'N/A'}<br/>
              <strong>Payment Transaction ID:</strong> ${dto.paymentTransactionId ?? 'N/A'}
            </div>
            ${dto.reviewUrl ? `<p><a class="btn" href="${dto.reviewUrl}">Review Request</a></p>` : ''}
          `,
        }),
      }),
    ]);
  }

  async sendTicketApproved(dto: {
    attendeeName: string;
    attendeeEmail: string;
    eventName: string;
    eventDate: Date;
    eventTime: string;
    eventLocation: string;
    ticketNumber?: string;
    registrationNumber?: string;
    ticketImageDataUrl?: string | null;
    tickets?: Array<{
      ticketNumber: string;
      registrationNumber: string;
      ticketImageDataUrl?: string | null;
    }>;
    ticketAccessUrl?: string;
  }): Promise<void> {
    const eventDate = dto.eventDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const tickets = dto.tickets?.length
      ? dto.tickets
      : [{
          ticketNumber: dto.ticketNumber ?? 'Pending',
          registrationNumber: dto.registrationNumber ?? 'Pending',
          ticketImageDataUrl: dto.ticketImageDataUrl,
        }];
    const ticketRows = tickets.map((ticket, index) => `
      <strong>Ticket ${index + 1}:</strong> ${ticket.ticketNumber}<br/>
      <strong>Registration ${index + 1}:</strong> ${ticket.registrationNumber}
    `).join('<br/>');

    await this.send({
      from: `APPNA NC Events <${this.extractEmail(SENDER)}>`,
      to: dto.attendeeEmail,
      subject: tickets.length > 1 ? 'Your Event Tickets Have Been Approved and PNG files are attached with this email' : 'Your Event Ticket Has Been Approved and PNG file is attached with this email',
      html: this.wrapEmail({
        title: tickets.length > 1 ? 'Tickets Approved' : 'Ticket Approved',
        subtitle: 'APPNA North Carolina Events',
        body: `
          <h2>Hi ${dto.attendeeName},</h2>
          <p>Your ${tickets.length > 1 ? `${tickets.length} tickets` : 'ticket'} for <strong>${dto.eventName}</strong> ${tickets.length > 1 ? 'have' : 'has'} been approved.</p>
          <div class="highlight">
            ${ticketRows}<br/>
            <strong>Date:</strong> ${eventDate}<br/>
            <strong>Time:</strong> ${dto.eventTime}<br/>
            <strong>Location:</strong> ${dto.eventLocation}
          </div>
          <p>Please bring the attached ticket or have it ready on your phone for QR check-in.</p>
          <p>If you are APPNA NC member you can your tickets from Member panel through the following button or you can get membership.</p>


          ${dto.ticketAccessUrl ? `<p><a class="btn" href="${dto.ticketAccessUrl}">Open My Tickets</a></p>` : ''}
        `,
      }),
      attachments: this.attachmentsFromDataUrls(
        tickets.map((ticket) => ticket.ticketImageDataUrl
          ? { dataUrl: ticket.ticketImageDataUrl, filename: `${ticket.ticketNumber}.png` }
          : null),
      ),
    });
  }

  async sendTicketRejected(dto: {
    attendeeName: string;
    attendeeEmail: string;
    eventName: string;
    notes?: string;
  }): Promise<void> {
    await this.send({
      from: `APPNA NC Events <${this.extractEmail(SENDER)}>`,
      to: dto.attendeeEmail,
      subject: `Ticket request update - ${dto.eventName}`,
      html: this.wrapEmail({
        title: 'Ticket Request Update',
        subtitle: 'APPNA North Carolina Events',
        body: `
          <h2>Hi ${dto.attendeeName},</h2>
          <p>Your ticket request for <strong>${dto.eventName}</strong> was not approved.</p>
          ${dto.notes ? `<div class="highlight"><strong>Admin note:</strong> ${dto.notes}</div>` : ''}
          <p>If you believe this was a mistake, please reply to this email and our team will review it.</p>
        `,
      }),
    });
  }

  async sendEventReminder(dto: {
    attendeeName: string;
    attendeeEmail: string;
    eventName: string;
    eventDate: Date;
    eventTime: string;
    eventLocation: string;
  }): Promise<void> {
    await this.send({
      from: `APPNA NC Events <${this.extractEmail(SENDER)}>`,
      to: dto.attendeeEmail,
      subject: `Reminder: ${dto.eventName}`,
      html: this.wrapEmail({
        title: 'Event Reminder',
        subtitle: 'APPNA North Carolina Events',
        body: `
          <h2>Hi ${dto.attendeeName},</h2>
          <p>This is a reminder for <strong>${dto.eventName}</strong>.</p>
          <div class="highlight">
            <strong>Date:</strong> ${dto.eventDate.toLocaleDateString('en-US')}<br/>
            <strong>Time:</strong> ${dto.eventTime}<br/>
            <strong>Location:</strong> ${dto.eventLocation}
          </div>
        `,
      }),
    });
  }

  private sendAcknowledgement(dto: ContactFormDto) {
    const year = new Date().getFullYear();
    return this.send({
      from: `APPNA North Carolina <${this.extractEmail(SENDER)}>`,
      to: dto.email,
      subject: `We've received your message — APPNA NC`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
  .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
  .hdr{background:#7a1f3d;padding:32px 40px;text-align:center}
  .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:600}
  .hdr p{margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px}
  .body{padding:36px 40px;color:#374151;font-size:15px;line-height:1.7}
  .body h2{margin:0 0 16px;color:#7a1f3d;font-size:18px;font-weight:600}
  .highlight{background:#fdf2f5;border-left:4px solid #7a1f3d;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;font-size:14px;color:#4b1c2e}
  .footer{background:#f8f9fb;padding:20px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
  .footer a{color:#7a1f3d;text-decoration:none}
</style></head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>APPNA North Carolina</h1>
    <p>Association of Physicians of Pakistani Descent of North America</p>
  </div>
  <div class="body">
    <h2>Hi ${dto.fullName},</h2>
    <p>Thank you for reaching out to APPNA North Carolina. We have successfully received your message and a member of our team will get back to you within <strong>24–48 hours</strong>.</p>
    <div class="highlight"><strong>Your subject:</strong> ${dto.subject}</div>
    <p>In the meantime, feel free to explore our website at <a href="https://www.appnanc.org" style="color:#7a1f3d;">www.appnanc.org</a> for the latest updates on events, committees, and community initiatives.</p>
    <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
  </div>
  <div class="footer">
    <p>© ${year} APPNA North Carolina Chapter · North Carolina, USA</p>
    <p><a href="mailto:appnanc@gmail.com">appnanc@gmail.com</a> · <a href="https://www.appnanc.org">www.appnanc.org</a></p>
  </div>
</div>
</body></html>`,
    });
  }

  private sendLeadToOrg(dto: ContactFormDto) {
    const year = new Date().getFullYear();
    const submittedAt = new Date().toLocaleString('en-US', {
      timeZone:  'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    return this.send({
      from: `APPNA NC Web <${this.extractEmail(SENDER)}>`,
      to: ORG_INBOX,
      replyTo: dto.email,
      subject: `New Contact Form Submission — ${dto.subject}`,
      html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
  .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
  .hdr{background:#1f4d7a;padding:28px 40px}
  .hdr h1{margin:0;color:#fff;font-size:20px;font-weight:600}
  .hdr p{margin:4px 0 0;color:rgba(255,255,255,.7);font-size:13px}
  .body{padding:32px 40px;color:#374151;font-size:15px;line-height:1.7}
  .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;margin-bottom:4px}
  .value{font-size:15px;color:#111827;margin-bottom:18px}
  .msg-box{background:#f8f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.7}
  .btn{display:inline-block;margin-top:24px;padding:12px 28px;background:#1f4d7a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
  hr{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
  .footer{background:#f8f9fb;padding:18px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
</style></head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>New Contact Form Submission</h1>
    <p>Received on ${submittedAt}</p>
  </div>
  <div class="body">
    <div class="label">Full Name</div><div class="value">${dto.fullName}</div>
    <div class="label">Email</div><div class="value"><a href="mailto:${dto.email}" style="color:#1f4d7a;">${dto.email}</a></div>
    <div class="label">Subject</div><div class="value">${dto.subject}</div>
    <hr/>
    <div class="label">Message</div>
    <div class="msg-box">${dto.message}</div>
    <a href="mailto:${dto.email}?subject=Re: ${encodeURIComponent(dto.subject)}" class="btn">Reply to ${dto.fullName}</a>
  </div>
  <div class="footer">
    <p>© ${year} APPNA NC — generated automatically from the website contact form.</p>
  </div>
</div>
</body></html>`,
    });
  }

  private formatEasternTime(date: Date) {
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    });
  }

  private wrapEmail({
    title,
    subtitle,
    body,
  }: {
    title: string;
    subtitle: string;
    body: string;
  }) {
    const year = new Date().getFullYear();

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
  .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
  .hdr{background:#7a1f3d;padding:30px 40px;text-align:center}
  .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:600}
  .hdr p{margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px}
  .body{padding:34px 40px;color:#374151;font-size:15px;line-height:1.7}
  .body h2{margin:0 0 16px;color:#7a1f3d;font-size:18px;font-weight:600}
  .highlight{background:#fdf2f5;border-left:4px solid #7a1f3d;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;font-size:14px;color:#4b1c2e}
  .btn{display:inline-block;margin-top:10px;padding:12px 22px;background:#7a1f3d;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
  .footer{background:#f8f9fb;padding:18px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
  a{color:#7a1f3d}
</style></head>
<body>
<div class="wrap">
  <div class="hdr">
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
  <div class="body">${body}</div>
  <div class="footer">© ${year} APPNA North Carolina Chapter</div>
</div>
</body></html>`;
  }

  /**
   * Converts a data: URL (e.g. from your PNG-generating ticket/card service)
   * directly into the { filename, content } shape Resend expects.
   * Resend accepts base64 strings directly as `content` — no need to decode to Buffer.
   */
  private attachmentsFromDataUrls(
    items: Array<{ dataUrl: string; filename: string } | null | undefined>,
  ): ResendAttachment[] | undefined {
    const attachments = items
      .filter((item): item is { dataUrl: string; filename: string } => Boolean(item))
      .map((item) => {
        const base64 = item.dataUrl.includes(',')
          ? item.dataUrl.split(',')[1]
          : item.dataUrl;
        return { filename: item.filename, content: base64 };
      });
    return attachments.length ? attachments : undefined;
  }

  private extractEmail(fromString: string): string {
    // Handles both "Name <email@domain.com>" and plain "email@domain.com"
    const match = fromString.match(/<(.+)>/);
    return match ? match[1] : fromString;
  }
}




// import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';
// import { ContactFormDto } from './dto/contact-form.dto';
// import { dataUrlAttachment } from '../../common/card-image';

// const SENDER    = process.env.MAIL_USER!;   // dev.appnanc@gmail.com
// const ORG_INBOX = process.env.MAIL_ORG!;    // appnanc@gmail.com

// @Injectable()
// export class MailService implements OnModuleInit {
//   private readonly logger = new Logger(MailService.name);
//   private transporter: nodemailer.Transporter;

//   onModuleInit() {
//     this.transporter = nodemailer.createTransport({
//       service: 'gmail',
//       auth: {
//         user: SENDER,
//         pass: process.env.MAIL_PASS,
//       },
//     });
//   }

//   async sendContactMails(dto: ContactFormDto): Promise<void> {
//     try {
//       await Promise.all([
//         this.sendAcknowledgement(dto),
//         this.sendLeadToOrg(dto),
//       ]);
//     } catch (err) {
//       this.logger.error('Failed to send contact emails', err);
//       throw new InternalServerErrorException(
//         'Email delivery failed. Please try again later.',
//       );
//     }
//   }

//   async sendMembershipPaymentReceived(dto: {
//     memberName: string;
//     memberEmail: string;
//     membershipType: string;
//     amount: number;
//     paymentProvider?: string | null;
//     paymentOrderId?: string | null;
//     paymentTransactionId?: string | null;
//   }): Promise<void> {
//     const submittedAt = this.formatEasternTime(new Date());

//     await Promise.all([
//       this.transporter.sendMail({
//         from: `"APPNA NC Membership" <${SENDER}>`,
//         to: ORG_INBOX,
//         replyTo: dto.memberEmail,
//         subject: `Membership payment received - ${dto.memberName}`,
//         html: this.wrapEmail({
//           title: 'Membership Payment Received',
//           subtitle: submittedAt,
//           body: `
//             <h2>Payment is ready for admin confirmation</h2>
//             <p><strong>${dto.memberName}</strong> has completed ${dto.paymentProvider ?? 'online'} payment for APPNA NC membership.</p>
//             <div class="highlight">
//               <strong>Member:</strong> ${dto.memberName}<br/>
//               <strong>Email:</strong> <a href="mailto:${dto.memberEmail}">${dto.memberEmail}</a><br/>
//               <strong>Plan:</strong> ${dto.membershipType}<br/>
//               <strong>Amount:</strong> $${dto.amount} USD<br/>
//               <strong>Payment Provider:</strong> ${dto.paymentProvider ?? 'N/A'}<br/>
//               <strong>Payment Order ID:</strong> ${dto.paymentOrderId ?? 'N/A'}<br/>
//               <strong>Payment Transaction ID:</strong> ${dto.paymentTransactionId ?? 'N/A'}
//             </div>
//             <p>Please verify the payment in Square and press <strong>Confirm Payment</strong> in the admin panel.</p>
//           `,
//         }),
//       }),
//       this.transporter.sendMail({
//         from: `"APPNA NC Membership" <${SENDER}>`,
//         to: dto.memberEmail,
//         subject: 'We received your APPNA NC membership payment',
//         html: this.wrapEmail({
//           title: 'Payment Received',
//           subtitle: 'APPNA North Carolina',
//           body: `
//             <h2>Hi ${dto.memberName},</h2>
//             <p>Thank you. We received your payment for the <strong>${dto.membershipType}</strong> membership.</p>
//             <div class="highlight">An APPNA NC admin will review your payment and send your membership confirmation within <strong>24 hours</strong>.</div>
//             <p>Your login uses the email and password you created during registration. You will receive an activation email as soon as the admin confirms your membership.</p>
//             <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
//           `,
//         }),
//       }),
//     ]);
//   }

//   async sendMembershipConfirmed(dto: {
//     memberName: string;
//     memberEmail: string;
//     membershipType: string;
//     loginUrl?: string;
//     membershipCardDataUrl?: string | null;
//   }): Promise<void> {
//     await this.transporter.sendMail({
//       from: `"APPNA NC Membership" <${SENDER}>`,
//       to: dto.memberEmail,
//       subject: 'Your APPNA NC membership is active',
//       html: this.wrapEmail({
//         title: 'Membership Confirmed',
//         subtitle: 'APPNA North Carolina',
//         body: `
//           <h2>Hi ${dto.memberName},</h2>
//           <p>Your <strong>${dto.membershipType}</strong> membership has been confirmed and your member portal access is now active.</p>
//           <div class="highlight">
//             <strong>Login email:</strong> ${dto.memberEmail}<br/>
//             <strong>Password:</strong> the password you created during registration
//           </div>
//           <p>You can now sign in and access your membership dashboard.</p>
//           ${dto.loginUrl ? `<p><a class="btn" href="${dto.loginUrl}">Open Member Login</a></p>` : ''}
//           <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
//         `,
//       }),
//       attachments: this.attachmentsFromDataUrls([
//         dto.membershipCardDataUrl
//           ? { dataUrl: dto.membershipCardDataUrl, filename: 'appna-nc-membership-card.png' }
//           : null,
//       ]),
//     });
//   }

//   async sendMembershipExpired(dto: {
//     memberName: string;
//     memberEmail: string;
//     membershipType: string;
//     expiredAt: Date;
//   }): Promise<void> {
//     await this.transporter.sendMail({
//       from: `"APPNA NC Membership" <${SENDER}>`,
//       to: dto.memberEmail,
//       subject: 'Your APPNA NC membership has expired',
//       html: this.wrapEmail({
//         title: 'Membership Expired',
//         subtitle: 'APPNA North Carolina',
//         body: `
//           <h2>Hi ${dto.memberName},</h2>
//           <p>Your <strong>${dto.membershipType}</strong> membership expired on <strong>${dto.expiredAt.toLocaleDateString('en-US', {
//             month: 'long',
//             day: 'numeric',
//             year: 'numeric',
//           })}</strong>.</p>
//           <div class="highlight">Annual memberships expire on <strong>December 31</strong> each year. Please renew from your member portal to restore full access.</div>
//           <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
//         `,
//       }),
//     });
//   }

//   // ── 1. Auto-reply to the person who submitted the form ───────────
//   async sendEventPaymentReceived(dto: {
//     attendeeName: string;
//     attendeeEmail: string;
//     eventName: string;
//     amount: number;
//     paymentProvider?: string | null;
//     paymentOrderId?: string | null;
//     paymentTransactionId?: string | null;
//     reviewUrl?: string;
//   }): Promise<void> {
//     const submittedAt = this.formatEasternTime(new Date());

//     await Promise.all([
//       this.transporter.sendMail({
//         from: `"APPNA NC Events" <${SENDER}>`,
//         to: dto.attendeeEmail,
//         subject: 'Payment Received - APPNA NC Event Registration',
//         html: this.wrapEmail({
//           title: 'Payment Received',
//           subtitle: 'APPNA North Carolina Events',
//           body: `
//             <h2>Hi ${dto.attendeeName},</h2>
//             <p>Your payment for <strong>${dto.eventName}</strong> was received successfully.</p>
//             <div class="highlight">
//               Your registration request has been submitted. Our team will verify your details, and ticket approval may take up to <strong>24 hours</strong>.
//             </div>
//             <p>You will receive another email once your ticket is approved.</p>
//             <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
//           `,
//         }),
//       }),
//       this.transporter.sendMail({
//         from: `"APPNA NC Events" <${SENDER}>`,
//         to: ORG_INBOX,
//         replyTo: dto.attendeeEmail,
//         subject: 'New Event Registration Waiting for Approval',
//         html: this.wrapEmail({
//           title: 'New Event Registration',
//           subtitle: submittedAt,
//           body: `
//             <h2>Registration awaiting review</h2>
//             <div class="highlight">
//               <strong>Event:</strong> ${dto.eventName}<br/>
//               <strong>Attendee:</strong> ${dto.attendeeName}<br/>
//               <strong>Email:</strong> <a href="mailto:${dto.attendeeEmail}">${dto.attendeeEmail}</a><br/>
//               <strong>Amount:</strong> $${dto.amount} USD<br/>
//               <strong>Payment Provider:</strong> ${dto.paymentProvider ?? 'N/A'}<br/>
//               <strong>Payment Order ID:</strong> ${dto.paymentOrderId ?? 'N/A'}<br/>
//               <strong>Payment Transaction ID:</strong> ${dto.paymentTransactionId ?? 'N/A'}
//             </div>
//             ${dto.reviewUrl ? `<p><a class="btn" href="${dto.reviewUrl}">Review Request</a></p>` : ''}
//           `,
//         }),
//       }),
//     ]);
//   }

//   async sendTicketApproved(dto: {
//     attendeeName: string;
//     attendeeEmail: string;
//     eventName: string;
//     eventDate: Date;
//     eventTime: string;
//     eventLocation: string;
//     ticketNumber?: string;
//     registrationNumber?: string;
//     ticketImageDataUrl?: string | null;
//     tickets?: Array<{
//       ticketNumber: string;
//       registrationNumber: string;
//       ticketImageDataUrl?: string | null;
//     }>;
//     ticketAccessUrl?: string;
//   }): Promise<void> {
//     const eventDate = dto.eventDate.toLocaleDateString('en-US', {
//       month: 'long',
//       day: 'numeric',
//       year: 'numeric',
//     });

//     const tickets = dto.tickets?.length
//       ? dto.tickets
//       : [{
//           ticketNumber: dto.ticketNumber ?? 'Pending',
//           registrationNumber: dto.registrationNumber ?? 'Pending',
//           ticketImageDataUrl: dto.ticketImageDataUrl,
//         }];
//     const ticketRows = tickets.map((ticket, index) => `
//       <strong>Ticket ${index + 1}:</strong> ${ticket.ticketNumber}<br/>
//       <strong>Registration ${index + 1}:</strong> ${ticket.registrationNumber}
//     `).join('<br/>');

//     await this.transporter.sendMail({
//       from: `"APPNA NC Events" <${SENDER}>`,
//       to: dto.attendeeEmail,
//       subject: tickets.length > 1 ? 'Your Event Tickets Have Been Approved' : 'Your Event Ticket Has Been Approved',
//       html: this.wrapEmail({
//         title: tickets.length > 1 ? 'Tickets Approved' : 'Ticket Approved',
//         subtitle: 'APPNA North Carolina Events',
//         body: `
//           <h2>Hi ${dto.attendeeName},</h2>
//           <p>Your ${tickets.length > 1 ? `${tickets.length} tickets` : 'ticket'} for <strong>${dto.eventName}</strong> ${tickets.length > 1 ? 'have' : 'has'} been approved.</p>
//           <div class="highlight">
//             ${ticketRows}<br/>
//             <strong>Date:</strong> ${eventDate}<br/>
//             <strong>Time:</strong> ${dto.eventTime}<br/>
//             <strong>Location:</strong> ${dto.eventLocation}
//           </div>
//           <p>Please bring the attached ticket or have it ready on your phone for QR check-in.</p>
//           ${dto.ticketAccessUrl ? `<p><a class="btn" href="${dto.ticketAccessUrl}">Open My Tickets</a></p>` : ''}
//         `,
//       }),
//       attachments: this.attachmentsFromDataUrls(
//         tickets.map((ticket) => ticket.ticketImageDataUrl
//           ? { dataUrl: ticket.ticketImageDataUrl, filename: `${ticket.ticketNumber}.png` }
//           : null),
//       ),
//     });
//   }

//   async sendTicketRejected(dto: {
//     attendeeName: string;
//     attendeeEmail: string;
//     eventName: string;
//     notes?: string;
//   }): Promise<void> {
//     await this.transporter.sendMail({
//       from: `"APPNA NC Events" <${SENDER}>`,
//       to: dto.attendeeEmail,
//       subject: `Ticket request update - ${dto.eventName}`,
//       html: this.wrapEmail({
//         title: 'Ticket Request Update',
//         subtitle: 'APPNA North Carolina Events',
//         body: `
//           <h2>Hi ${dto.attendeeName},</h2>
//           <p>Your ticket request for <strong>${dto.eventName}</strong> was not approved.</p>
//           ${dto.notes ? `<div class="highlight"><strong>Admin note:</strong> ${dto.notes}</div>` : ''}
//           <p>If you believe this was a mistake, please reply to this email and our team will review it.</p>
//         `,
//       }),
//     });
//   }

//   async sendEventReminder(dto: {
//     attendeeName: string;
//     attendeeEmail: string;
//     eventName: string;
//     eventDate: Date;
//     eventTime: string;
//     eventLocation: string;
//   }): Promise<void> {
//     await this.transporter.sendMail({
//       from: `"APPNA NC Events" <${SENDER}>`,
//       to: dto.attendeeEmail,
//       subject: `Reminder: ${dto.eventName}`,
//       html: this.wrapEmail({
//         title: 'Event Reminder',
//         subtitle: 'APPNA North Carolina Events',
//         body: `
//           <h2>Hi ${dto.attendeeName},</h2>
//           <p>This is a reminder for <strong>${dto.eventName}</strong>.</p>
//           <div class="highlight">
//             <strong>Date:</strong> ${dto.eventDate.toLocaleDateString('en-US')}<br/>
//             <strong>Time:</strong> ${dto.eventTime}<br/>
//             <strong>Location:</strong> ${dto.eventLocation}
//           </div>
//         `,
//       }),
//     });
//   }

//   private sendAcknowledgement(dto: ContactFormDto) {
//     const year = new Date().getFullYear();
//     return this.transporter.sendMail({
//       from:    `"APPNA North Carolina" <${SENDER}>`,
//       to:      dto.email,
//       subject: `We've received your message — APPNA NC`,
//       html: `<!DOCTYPE html>
// <html lang="en">
// <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
// <style>
//   body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
//   .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
//   .hdr{background:#7a1f3d;padding:32px 40px;text-align:center}
//   .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:600}
//   .hdr p{margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px}
//   .body{padding:36px 40px;color:#374151;font-size:15px;line-height:1.7}
//   .body h2{margin:0 0 16px;color:#7a1f3d;font-size:18px;font-weight:600}
//   .highlight{background:#fdf2f5;border-left:4px solid #7a1f3d;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;font-size:14px;color:#4b1c2e}
//   .footer{background:#f8f9fb;padding:20px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
//   .footer a{color:#7a1f3d;text-decoration:none}
// </style></head>
// <body>
// <div class="wrap">
//   <div class="hdr">
//     <h1>APPNA North Carolina</h1>
//     <p>Association of Physicians of Pakistani Descent of North America</p>
//   </div>
//   <div class="body">
//     <h2>Hi ${dto.fullName},</h2>
//     <p>Thank you for reaching out to APPNA North Carolina. We have successfully received your message and a member of our team will get back to you within <strong>24–48 hours</strong>.</p>
//     <div class="highlight"><strong>Your subject:</strong> ${dto.subject}</div>
//     <p>In the meantime, feel free to explore our website at <a href="https://www.appnanc.org" style="color:#7a1f3d;">www.appnanc.org</a> for the latest updates on events, committees, and community initiatives.</p>
//     <p>Warm regards,<br/><strong>APPNA NC Team</strong></p>
//   </div>
//   <div class="footer">
//     <p>© ${year} APPNA North Carolina Chapter · North Carolina, USA</p>
//     <p><a href="mailto:appnanc@gmail.com">appnanc@gmail.com</a> · <a href="https://www.appnanc.org">www.appnanc.org</a></p>
//   </div>
// </div>
// </body></html>`,
//     });
//   }

//   // ── 2. Lead notification to the org inbox ────────────────────────
//   private sendLeadToOrg(dto: ContactFormDto) {
//     const year = new Date().getFullYear();
//     const submittedAt = new Date().toLocaleString('en-US', {
//       timeZone:  'America/New_York',
//       dateStyle: 'full',
//       timeStyle: 'short',
//     });
//     return this.transporter.sendMail({
//       from:    `"APPNA NC Web" <${SENDER}>`,
//       to:      ORG_INBOX,
//       replyTo: dto.email,
//       subject: `New Contact Form Submission — ${dto.subject}`,
//       html: `<!DOCTYPE html>
// <html lang="en">
// <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
// <style>
//   body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
//   .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
//   .hdr{background:#1f4d7a;padding:28px 40px}
//   .hdr h1{margin:0;color:#fff;font-size:20px;font-weight:600}
//   .hdr p{margin:4px 0 0;color:rgba(255,255,255,.7);font-size:13px}
//   .body{padding:32px 40px;color:#374151;font-size:15px;line-height:1.7}
//   .label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#9ca3af;margin-bottom:4px}
//   .value{font-size:15px;color:#111827;margin-bottom:18px}
//   .msg-box{background:#f8f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;font-size:14px;color:#374151;white-space:pre-wrap;line-height:1.7}
//   .btn{display:inline-block;margin-top:24px;padding:12px 28px;background:#1f4d7a;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
//   hr{border:none;border-top:1px solid #e5e7eb;margin:24px 0}
//   .footer{background:#f8f9fb;padding:18px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
// </style></head>
// <body>
// <div class="wrap">
//   <div class="hdr">
//     <h1>New Contact Form Submission</h1>
//     <p>Received on ${submittedAt}</p>
//   </div>
//   <div class="body">
//     <div class="label">Full Name</div><div class="value">${dto.fullName}</div>
//     <div class="label">Email</div><div class="value"><a href="mailto:${dto.email}" style="color:#1f4d7a;">${dto.email}</a></div>
//     <div class="label">Subject</div><div class="value">${dto.subject}</div>
//     <hr/>
//     <div class="label">Message</div>
//     <div class="msg-box">${dto.message}</div>
//     <a href="mailto:${dto.email}?subject=Re: ${encodeURIComponent(dto.subject)}" class="btn">Reply to ${dto.fullName}</a>
//   </div>
//   <div class="footer">
//     <p>© ${year} APPNA NC — generated automatically from the website contact form.</p>
//   </div>
// </div>
// </body></html>`,
//     });
//   }

//   private formatEasternTime(date: Date) {
//     return date.toLocaleString('en-US', {
//       timeZone: 'America/New_York',
//       dateStyle: 'full',
//       timeStyle: 'short',
//     });
//   }

//   private wrapEmail({
//     title,
//     subtitle,
//     body,
//   }: {
//     title: string;
//     subtitle: string;
//     body: string;
//   }) {
//     const year = new Date().getFullYear();

//     return `<!DOCTYPE html>
// <html lang="en">
// <head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
// <style>
//   body{margin:0;padding:0;background:#f8f9fb;font-family:Arial,sans-serif}
//   .wrap{max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb}
//   .hdr{background:#7a1f3d;padding:30px 40px;text-align:center}
//   .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:600}
//   .hdr p{margin:6px 0 0;color:rgba(255,255,255,.75);font-size:13px}
//   .body{padding:34px 40px;color:#374151;font-size:15px;line-height:1.7}
//   .body h2{margin:0 0 16px;color:#7a1f3d;font-size:18px;font-weight:600}
//   .highlight{background:#fdf2f5;border-left:4px solid #7a1f3d;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;font-size:14px;color:#4b1c2e}
//   .btn{display:inline-block;margin-top:10px;padding:12px 22px;background:#7a1f3d;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600}
//   .footer{background:#f8f9fb;padding:18px 40px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb}
//   a{color:#7a1f3d}
// </style></head>
// <body>
// <div class="wrap">
//   <div class="hdr">
//     <h1>${title}</h1>
//     <p>${subtitle}</p>
//   </div>
//   <div class="body">${body}</div>
//   <div class="footer">© ${year} APPNA North Carolina Chapter</div>
// </div>
// </body></html>`;
//   }

//   private attachmentsFromDataUrls(
//     items: Array<{ dataUrl: string; filename: string } | null | undefined>,
//   ): nodemailer.SendMailOptions['attachments'] | undefined {
//     const attachments = items
//       .map((item) => item ? dataUrlAttachment(item.dataUrl, item.filename) : undefined)
//       .filter((item): item is NonNullable<ReturnType<typeof dataUrlAttachment>> => Boolean(item));
//     return attachments.length ? attachments : undefined;
//   }
// }
