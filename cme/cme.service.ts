import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
import { CreateCmeDto } from './dto/create-cme.dto';

@Injectable()
export class CmeService {
  constructor(private readonly prisma: PrismaService, private readonly mailService: MailService) {}

  async create(dto: CreateCmeDto) {
    const entry = await this.prisma.cmeEntry.create({ data: dto });
    await this.mailService.sendCmeSubmission(entry);
    return { id: entry.id, message: 'Your CME interest form has been received.' };
  }

  list() {
    return this.prisma.cmeEntry.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
