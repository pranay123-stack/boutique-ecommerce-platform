import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CartService, type CartIdentity } from './cart.service';
import { AddToCartDto, ApplyCartCouponDto, MergeCartDto, UpdateCartItemDto } from './dto/cart.dto';
import { CurrentUser, Public, SessionId, type AuthenticatedUser } from '../../common/decorators';

/**
 * Cart routes are `@Public()` so guests can shop, but the JWT guard still
 * populates `user` when a token is present - the identity resolver below then
 * prefers the member cart over the anonymous one.
 */
@ApiTags('Cart')
@ApiHeader({
  name: 'X-Session-Id',
  required: false,
  description: 'Anonymous cart identifier for guest shoppers',
})
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  private identity(
    user: AuthenticatedUser | undefined,
    sessionId: string | undefined,
  ): CartIdentity {
    return user?.id ? { userId: user.id } : { sessionId };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Current cart with live pricing and stock status' })
  getCart(@CurrentUser() user: AuthenticatedUser, @SessionId() sessionId: string) {
    return this.cart.getCart(this.identity(user, sessionId));
  }

  @Post('items')
  @Public()
  @ApiOperation({ summary: 'Add a variant to the cart' })
  addItem(
    @Body() dto: AddToCartDto,
    @CurrentUser() user: AuthenticatedUser,
    @SessionId() sessionId: string,
  ) {
    return this.cart.addItem(this.identity(user, sessionId), dto);
  }

  @Patch('items/:itemId')
  @Public()
  @ApiOperation({ summary: 'Change a line quantity (0 removes it)' })
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
    @CurrentUser() user: AuthenticatedUser,
    @SessionId() sessionId: string,
  ) {
    return this.cart.updateItem(this.identity(user, sessionId), itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @Public()
  @ApiOperation({ summary: 'Remove a line from the cart' })
  removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
    @SessionId() sessionId: string,
  ) {
    return this.cart.removeItem(this.identity(user, sessionId), itemId);
  }

  @Delete()
  @Public()
  @ApiOperation({ summary: 'Empty the cart' })
  clear(@CurrentUser() user: AuthenticatedUser, @SessionId() sessionId: string) {
    return this.cart.clear(this.identity(user, sessionId));
  }

  @Post('coupon')
  @Public()
  @ApiOperation({ summary: 'Apply a discount code' })
  applyCoupon(
    @Body() dto: ApplyCartCouponDto,
    @CurrentUser() user: AuthenticatedUser,
    @SessionId() sessionId: string,
  ) {
    return this.cart.applyCoupon(this.identity(user, sessionId), dto.code);
  }

  @Delete('coupon')
  @Public()
  @ApiOperation({ summary: 'Remove the applied discount code' })
  removeCoupon(@CurrentUser() user: AuthenticatedUser, @SessionId() sessionId: string) {
    return this.cart.removeCoupon(this.identity(user, sessionId));
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge a guest cart into the signed-in cart after login' })
  merge(
    @Body() dto: MergeCartDto,
    @CurrentUser('id') userId: string,
    @SessionId() sessionId: string,
  ) {
    return this.cart.mergeGuestCart(userId, dto.sessionId ?? sessionId);
  }
}
