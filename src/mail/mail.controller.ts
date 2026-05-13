import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MailService } from './mail.service';
import { ContactFormDto } from './dto/contact-form.dto';

// No JWT guard — this is a public endpoint (anyone can submit the form)
@Controller('contact')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  // ──────────────────────────────────────────────────────────────
  // POST /api/contact
  //
  // Receives the contact form payload, fires two emails
  // (acknowledgement to sender + lead to org), and returns 200.
  // ──────────────────────────────────────────────────────────────
  @Post()
  @HttpCode(HttpStatus.OK)
  async submitContactForm(@Body() dto: ContactFormDto) {
    await this.mailService.sendContactMails(dto);
    return {
      message: 'Your message has been received. We will get back to you shortly.',
    };
  }
}