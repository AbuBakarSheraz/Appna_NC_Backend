// // src/common/guards/admin.guard.ts
// //
// // Add isAdmin: Boolean @default(false) to your User model in Prisma,
// // then include it in your JWT payload when signing the token.
// // This guard simply checks that flag.

// import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

// @Injectable()
// export class AdminGuard implements CanActivate {
//   canActivate(context: ExecutionContext): boolean {
//     const request = context.switchToHttp().getRequest();

//     // req.user is populated by JwtAuthGuard before this guard runs
//     if (!request.user?.isAdmin) {
//       throw new ForbiddenException('Admin access required');
//     }

//     return true;
//   }
// }