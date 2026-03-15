import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────
  // GET ALL USERS  (paginated + searchable)
  // Returns every registered user with their profile completion status
  // and membership info — everything the admin table needs in one query.
  // ─────────────────────────────────────────────────────────────────
  async getAllUsers(page = 1, limit = 20, search = '') {
    const skip = (page - 1) * limit;

    // Build a dynamic where clause so search is optional
    const where = search
      ? {
          OR: [
            { email:    { contains: search } },
            { username: { contains: search } },
            // Search by first/last name through the relation
            { basicInfo: { firstName: { contains: search } } },
            { basicInfo: { lastName:  { contains: search } } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' }, // newest registrations first
        select: {
          id:                 true,
          email:              true,
          username:           true,
          prefix:             true,
          suffix:             true,
          imagePath:          true,
          isProfileCompleted: true,
          profileStep:        true,
          createdAt:          true,
          basicInfo: {
            select: {
              firstName:   true,
              lastName:    true,
              phoneNumber: true,
            },
          },
          medicalEducation: {
            select: { primarySpecialty: true },
          },
          membership: {
            select: {
              id:        true,
              type:      true,
              price:     true,
              isActive:  true,
              startedAt: true,
              expiresAt: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data:  users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // GET PENDING PAYMENTS
  // Users who have selected a membership but isActive is still false.
  // These are the people the admin needs to act on.
  // ─────────────────────────────────────────────────────────────────
  async getPendingPayments() {
    const memberships = await this.prisma.membership.findMany({
      where: { isActive: false },
      orderBy: { startedAt: 'asc' }, // oldest first so nobody waits forever
      include: {
        user: {
          select: {
            id:          true,
            email:       true,
            username:    true,
            prefix:      true,
            suffix:      true,
            imagePath:   true,
            createdAt:   true,
            basicInfo: {
              select: {
                firstName:   true,
                lastName:    true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    return { data: memberships, total: memberships.length };
  }

  // ─────────────────────────────────────────────────────────────────
  // CONFIRM PAYMENT  (admin manually verifies PayPal then calls this)
  // ─────────────────────────────────────────────────────────────────
  async confirmPayment(userId: string) {
    // Verify user exists before touching anything
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { userId },
        data:  { isActive: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:  { isProfileCompleted: true, profileStep: 5 },
      }),
    ]);

    return { message: `Membership confirmed for ${user.email}` };
  }

  // ─────────────────────────────────────────────────────────────────
  // AUTO-CONFIRM STUDENT MEMBERSHIP
  // Called automatically when a STUDENT selects their plan.
  // Since it's free, no PayPal step is needed — activate immediately.
  // ─────────────────────────────────────────────────────────────────
  async autoConfirmStudent(userId: string) {
    const membership = await this.prisma.membership.findUnique({ where: { userId } });

    if (!membership) throw new NotFoundException('Membership record not found');
    if (membership.type !== 'STUDENT') return; // safety guard — only for students

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { userId },
        data:  { isActive: true },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:  { isProfileCompleted: true, profileStep: 5 },
      }),
    ]);
  }

  // ─────────────────────────────────────────────────────────────────
  // REVOKE MEMBERSHIP  (admin can deactivate if needed)
  // ─────────────────────────────────────────────────────────────────
  async revokeMembership(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.$transaction([
      this.prisma.membership.update({
        where: { userId },
        data:  { isActive: false },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data:  { isProfileCompleted: false },
      }),
    ]);

    return { message: `Membership revoked for ${user.email}` };
  }

  // ─────────────────────────────────────────────────────────────────
  // DASHBOARD STATS  (summary numbers for the admin overview)
  // ─────────────────────────────────────────────────────────────────
  async getStats() {
    const [
      totalUsers,
      completedProfiles,
      pendingPayments,
      activeMembers,
      studentMembers,
      annualMembers,
      lifetimeMembers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isProfileCompleted: true } }),
      this.prisma.membership.count({ where: { isActive: false } }),
      this.prisma.membership.count({ where: { isActive: true } }),
      this.prisma.membership.count({ where: { type: 'STUDENT',  isActive: true } }),
      this.prisma.membership.count({ where: { type: 'ANNUAL',   isActive: true } }),
      this.prisma.membership.count({ where: { type: 'LIFETIME', isActive: true } }),
    ]);

    return {
      totalUsers,
      completedProfiles,
      pendingPayments,
      activeMembers,
      breakdown: { student: studentMembers, annual: annualMembers, lifetime: lifetimeMembers },
    };
  }
}