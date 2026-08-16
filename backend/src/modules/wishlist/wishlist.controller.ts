import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto } from './dto/wishlist.dto';
import { CurrentUser } from '../../common/decorators';

@ApiTags('Wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @ApiOperation({ summary: 'Saved items for the signed-in customer' })
  get(@CurrentUser('id') userId: string) {
    return this.wishlist.get(userId);
  }

  @Post('items')
  @ApiOperation({ summary: 'Save a product (idempotent)' })
  add(@CurrentUser('id') userId: string, @Body() dto: AddWishlistItemDto) {
    return this.wishlist.add(userId, dto);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Remove a saved item' })
  remove(@CurrentUser('id') userId: string, @Param('itemId') itemId: string) {
    return this.wishlist.remove(userId, itemId);
  }

  @Delete('products/:productId')
  @ApiOperation({ summary: 'Remove a product from the wishlist by product id' })
  removeByProduct(@CurrentUser('id') userId: string, @Param('productId') productId: string) {
    return this.wishlist.removeByProduct(userId, productId);
  }
}
