import {
  Controller, Get, Patch, Param,
  Query, UseGuards, ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt.guard';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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

  @Patch('revoke-membership/:userId')
  revokeMembership(@Param('userId') userId: string) {
    return this.adminService.revokeMembership(userId);
  }
}