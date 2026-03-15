// ─── src/admin/admin.module.ts ────────────────────────────────────
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService], // ⭐ REQUIRED
})
export class AdminModule {}


// ─── src/common/guards/admin.guard.ts ────────────────────────────
// import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
//
// @Injectable()
// export class AdminGuard implements CanActivate {
//   canActivate(context: ExecutionContext): boolean {
//     const { user } = context.switchToHttp().getRequest();
//     if (!user?.isAdmin) throw new ForbiddenException('Admin access required');
//     return true;
//   }
// }


// ─── PRISMA SCHEMA ADDITION ───────────────────────────────────────
// Add these two fields to your User model:
//
// model User {
//   ...existing fields...
//   isAdmin   Boolean  @default(false)   // ← add this
// }
//
// Then run:  npx prisma migrate dev --name add_isAdmin
//
// To make yourself admin, run once in MySQL:
//   UPDATE User SET isAdmin = true WHERE email = 'your@email.com';


// ─── INCLUDE isAdmin IN JWT PAYLOAD ──────────────────────────────
// In your auth.service.ts where you sign the JWT, add isAdmin:
//
// const payload = {
//   userId:  user.id,
//   email:   user.email,
//   isAdmin: user.isAdmin,   // ← add this
// };


// ─── REGISTER AdminModule IN app.module.ts ────────────────────────
// imports: [..., AdminModule]


// ─── AUTO-CONFIRM STUDENTS ────────────────────────────────────────
// In profile.service.ts, update selectMembership() to call
// adminService.autoConfirmStudent() when type === 'STUDENT'.
//
// Since ProfileService and AdminService would create a circular dep,
// the cleanest approach is to inline the auto-confirm logic directly
// inside selectMembership() — shown below:
//
// async selectMembership(userId: string, dto: MembershipDto) {
//   const { type } = dto;
//   const price     = MEMBERSHIP_PRICING[type];
//   const expiresAt = type === 'LIFETIME' ? null : this.calcExpiry();
//
//   await this.prisma.membership.upsert({
//     where:  { userId },
//     update: { type, price, expiresAt, isActive: false, startedAt: new Date() },
//     create: { userId, type, price, expiresAt, isActive: false },
//   });
//
//   // ── Auto-activate students immediately (free plan) ──
//   if (type === 'STUDENT') {
//     await this.prisma.$transaction([
//       this.prisma.membership.update({ where: { userId }, data: { isActive: true } }),
//       this.prisma.user.update({ where: { id: userId }, data: { isProfileCompleted: true, profileStep: 5 } }),
//     ]);
//     return { message: 'Student membership activated.', data: { type, price: 0, expiresAt } };
//   }
//
//   return { message: 'Membership selected. Proceed to payment.', data: { type, price, expiresAt } };
// }