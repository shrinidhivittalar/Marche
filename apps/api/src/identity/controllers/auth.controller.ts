import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService, REFRESH_TOKEN_TTL_MS } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';

const REFRESH_COOKIE_NAME = 'marche_refresh_token';

// Tighter limit for the endpoints a brute-force/credential-stuffing attempt
// would actually target — the global 100/min default (app.module.ts) is too
// loose to stop rapid password guessing on its own.
//
// Overridable by an explicit environment variable. This exists for automated
// end-to-end runs, which sign in far more often than any human would and
// otherwise trip the limiter partway through a suite (playwright.config.ts
// sets 500). Refresh tokens are single-use and rotating (auth.service.ts), so
// a test run cannot avoid this by reusing one saved session.
export const DEFAULT_AUTH_RATE_LIMIT = 5;

// The override is parsed defensively because the failure is silent and total:
// `Number('abc')` is NaN and `Number('')` is 0, and @Throttle given either
// stops limiting in any meaningful way. A typo on the Render dashboard would
// therefore switch brute-force protection off with no error and no log line.
// Anything that is not a positive finite count falls back to the default.
//
// No upper clamp. Any ceiling would have to sit above the 500 the e2e suite
// legitimately needs, and 500/min is already far past the point where a limit
// constrains an attacker — so a clamp would buy no protection while adding a
// second number to keep in sync with the test config.
export function resolveAuthRateLimit(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_AUTH_RATE_LIMIT;
  }
  return Math.floor(parsed);
}

const AUTH_RATE_LIMIT = resolveAuthRateLimit(process.env.AUTH_RATE_LIMIT);
const AUTH_THROTTLE = { default: { limit: AUTH_RATE_LIMIT, ttl: 60_000 } };

function requestContext(req: Request) {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

// The refresh token is only ever readable by the browser via this cookie —
// never handed back in a JSON body — so it can't be exfiltrated by an XSS
// payload the way a JS-accessible token could (CLAUDE.md security rule).
//
// CSRF: no separate token here. sameSite:'strict' already stops the browser
// from attaching this cookie to any cross-site-triggered request in every
// modern browser, and CORS is locked to the exact FRONTEND_ORIGIN, so even a
// same-site-cookie edge case couldn't read the response. A double-submit
// CSRF token was tried and reverted — it fundamentally conflicts with
// restoring a session silently on page load (the frontend has no token to
// send on that very first /auth/refresh call, since one is only ever handed
// out in a login/refresh response, and in-memory state doesn't survive a
// reload) and adds real complexity for protection that's already redundant
// with sameSite+CORS given how narrowly these two cookies are used.
function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary:
      'Create an account and send a verification email (always 201 with the same body, whether or not the address was already registered)',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary:
      'Exchange email/password for an access token; refresh token is set as an httpOnly cookie',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.login(
      dto,
      requestContext(req),
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, user };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate the refresh token cookie for a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token cookie present');
    }
    const { accessToken, refreshToken: nextRefreshToken } = await this.authService.refresh(
      refreshToken,
      requestContext(req),
    );
    setRefreshCookie(res, nextRefreshToken);
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Revoke the session tied to the caller's refresh token cookie" })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    clearRefreshCookie(res);
  }

  @Post('forgot-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Request a password reset email (always 204, regardless of whether the email exists)',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using a password reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Get('verify-email')
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark the account owning this token as email-verified' })
  async verifyEmail(@Query('token') token?: string) {
    if (!token) {
      throw new BadRequestException('token query parameter is required');
    }
    await this.authService.verifyEmail(token);
  }
}
