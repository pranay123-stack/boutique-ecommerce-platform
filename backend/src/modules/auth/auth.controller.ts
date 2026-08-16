import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService, type AuthResult, type TokenPair } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { Audit, CurrentUser, Public, type AuthenticatedUser } from '../../common/decorators';
import { CSRF_COOKIE, CsrfGuard } from '../../common/guards/csrf.guard';
import { AUTH_THROTTLE } from '../../common/auth-throttle';

const REFRESH_COOKIE = 'refreshToken';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private setAuthCookies(res: Response, tokens: TokenPair): void {
    const isProduction = this.config.get<boolean>('app.isProduction') ?? false;
    const refreshDays = 30;

    // httpOnly: JS cannot read it, so XSS cannot exfiltrate the long-lived token.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });

    // Readable by first-party JS by design - it is echoed back as a header.
    res.cookie(CSRF_COOKIE, tokens.csrfToken, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: refreshDays * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  /** The refresh token never travels in the JSON body to a browser client. */
  private stripRefresh(result: AuthResult) {
    const { refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }

  private context(req: Request) {
    return { ipAddress: req.ip, userAgent: req.headers['user-agent'] };
  }

  // ----------------------------------------------------------------- routes

  @Post('register')
  @Public()
  @Throttle({ default: AUTH_THROTTLE.register })
  @Audit('auth.register', 'User')
  @ApiOperation({ summary: 'Create a customer account' })
  @ApiResponse({ status: 201, description: 'Account created; tokens issued' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(dto, this.context(req));
    this.setAuthCookies(res, result);
    return this.stripRefresh(result);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.login })
  @ApiOperation({ summary: 'Authenticate and receive an access token' })
  @ApiResponse({ status: 200, description: 'Authenticated' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, this.context(req));
    this.setAuthCookies(res, result);
    return this.stripRefresh(result);
  }

  @Post('refresh')
  @Public()
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and mint a new access token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies?.[REFRESH_COOKIE] as string) ?? dto.refreshToken ?? '';
    const tokens = await this.auth.refresh(raw, this.context(req));
    this.setAuthCookies(res, tokens);
    const { refreshToken: _r, ...safe } = tokens;
    return safe;
  }

  @Post('logout')
  @Public()
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    const result = await this.auth.logout(raw);
    this.clearAuthCookies(res);
    return result;
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.forgotPassword })
  @ApiOperation({ summary: 'Send a password reset link' })
  @ApiResponse({ status: 200, description: 'Always succeeds - prevents account enumeration' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.resetPassword })
  @ApiOperation({ summary: 'Complete a password reset' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('verify-email')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm an email address' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_THROTTLE.resendVerification })
  @ApiOperation({ summary: 'Re-send the verification email' })
  resendVerification(@CurrentUser('id') userId: string) {
    return this.auth.resendVerification(userId);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Audit('auth.change_password', 'User')
  @ApiOperation({ summary: 'Change password for the signed-in user' })
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(userId, dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated principal' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
