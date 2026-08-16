import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate, skipOf, type PageParams } from '../../common/dto/pagination.dto';
import type {
  AdminUpdateUserDto,
  CreateAddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- profile

  async getProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        role: { select: { name: true } },
        _count: { select: { orders: true, reviews: true } },
      },
    });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        emailVerified: true,
      },
    });
  }

  // ----------------------------------------------------------- addresses

  async listAddresses(userId: string) {
    return this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefaultShipping: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    const count = await this.prisma.address.count({ where: { userId, deletedAt: null } });
    if (count >= 20) {
      throw new BadRequestException('You can save at most 20 addresses');
    }

    return this.prisma.$transaction(async (tx) => {
      // Only one address may hold each default flag.
      if (dto.isDefaultShipping) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
      }
      if (dto.isDefaultBilling) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultBilling: false } });
      }
      return tx.address.create({
        data: {
          ...dto,
          userId,
          country: dto.country ?? 'IN',
          // The first address a customer saves becomes their default.
          isDefaultShipping: dto.isDefaultShipping ?? count === 0,
          isDefaultBilling: dto.isDefaultBilling ?? count === 0,
        },
      });
    });
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    await this.assertOwnsAddress(userId, addressId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefaultShipping) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultShipping: false } });
      }
      if (dto.isDefaultBilling) {
        await tx.address.updateMany({ where: { userId }, data: { isDefaultBilling: false } });
      }
      return tx.address.update({ where: { id: addressId }, data: dto });
    });
  }

  async deleteAddress(userId: string, addressId: string) {
    await this.assertOwnsAddress(userId, addressId);
    // Soft delete - orders reference addresses by snapshot, but keeping the row
    // avoids breaking any historical join.
    await this.prisma.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), isDefaultShipping: false, isDefaultBilling: false },
    });
    return { success: true };
  }

  private async assertOwnsAddress(userId: string, addressId: string): Promise<void> {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!address) throw new NotFoundException('Address not found');
  }

  // --------------------------------------------------------------- admin

  async findAll(query: PageParams & { search?: string; status?: UserStatus }) {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipOf(query),
        take: query.limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          role: { select: { name: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /** Customer 360: profile, addresses, lifetime value and recent orders. */
  async findOneAdmin(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        emailVerified: true,
        createdAt: true,
        lastLoginAt: true,
        role: { select: { id: true, name: true } },
        addresses: { where: { deletedAt: null } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            grandTotal: true,
            createdAt: true,
            _count: { select: { items: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const spend = await this.prisma.order.aggregate({
      where: { userId: id, paymentStatus: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
      _sum: { grandTotal: true },
      _count: true,
      _avg: { grandTotal: true },
    });

    return {
      ...user,
      stats: {
        lifetimeValue: spend._sum.grandTotal ?? new Prisma.Decimal(0),
        paidOrderCount: spend._count,
        averageOrderValue: spend._avg.grandTotal ?? new Prisma.Decimal(0),
      },
    };
  }

  async updateByAdmin(id: string, dto: AdminUpdateUserDto) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Customer not found');

    let roleId: string | undefined;
    if (dto.roleName) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.roleName } });
      if (!role) throw new BadRequestException(`Unknown role: ${dto.roleName}`);
      roleId = role.id;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(roleId ? { roleId } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        role: { select: { name: true } },
      },
    });

    // Suspending an account must terminate its live sessions immediately.
    if (dto.status && dto.status !== UserStatus.ACTIVE) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return updated;
  }
}
