import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ContactFormDto } from './dto/contact-form.dto';

const SENDER    = process.env.MAIL_USER!;   // dev.appnanc@gmail.com
const ORG_INBOX = process.env.MAIL_ORG!;    // appnanc@gmail.com

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  onModuleInit() {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: SENDER,
        pass: process.env.MAIL_PASS,
      },
    });
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

  // ── 1. Auto-reply to the person who submitted the form ───────────
  private sendAcknowledgement(dto: ContactFormDto) {
    const year = new Date().getFullYear();
    return this.transporter.sendMail({
      from:    `"APPNA North Carolina" <${SENDER}>`,
      to:      dto.email,
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

  // ── 2. Lead notification to the org inbox ────────────────────────
  private sendLeadToOrg(dto: ContactFormDto) {
    const year = new Date().getFullYear();
    const submittedAt = new Date().toLocaleString('en-US', {
      timeZone:  'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    return this.transporter.sendMail({
      from:    `"APPNA NC Web" <${SENDER}>`,
      to:      ORG_INBOX,
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
}