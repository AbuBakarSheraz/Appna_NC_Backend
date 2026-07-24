import {
  Controller, Get, Patch, Param,
  Query, UseGuards, ParseIntPipe,
  DefaultValuePipe,Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminService } from './admin.service';
import { SponsorshipService } from '../sponsorship/sponsorship.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService, private readonly sponsorshipService: SponsorshipService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  getAllUsers(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search = '',
  ) {
    return this.adminService.getAllUsers(page, limit, search);
  }

  @Get('pending-payments')
  getPendingPayments() {
    return this.adminService.getPendingPayments();
  }

  @Patch('confirm-payment/:userId')
  confirmPayment(@Param('userId') userId: string) {
    return this.adminService.confirmPayment(userId);
  }
  @Get('pending-sponsorships')
getPendingSponsorships() {
  return this.sponsorshipService.getPendingSponsorships();
}

@Post('confirm-sponsorship/:id')
confirmSponsorship(@Param('id') id: string) {
  return this.sponsorshipService.confirmSponsorship(id);
}

  @Get('sponsorships')
getAllSponsorships(@Query('status') status?: 'PAID' | 'CONFIRMED') {
  return this.sponsorshipService.getAllSponsorships(status);
}

  @Patch('revoke-membership/:userId')
  revokeMembership(@Param('userId') userId: string) {
    return this.adminService.revokeMembership(userId);
  }
}
