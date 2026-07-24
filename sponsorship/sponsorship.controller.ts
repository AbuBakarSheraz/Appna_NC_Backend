import { Body, Controller, Post } from '@nestjs/common';
import { SponsorshipService } from './sponsorship.service';
import { SponsorshipDto } from './dto/sponsorship.dto';

@Controller('sponsorship')
export class SponsorshipController {
  constructor(private readonly service: SponsorshipService) {}

  @Post('pay')
  submit(@Body() dto: SponsorshipDto) {
    return this.service.submitSponsorship(dto);
  }
}