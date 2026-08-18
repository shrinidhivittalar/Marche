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
import { UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService, REFRESH_TOKEN_TTL_MS } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { AUTH_RATE_LIMIT, AUTH_RATE_LIMIT_TTL_MS } from '../auth-rate-limit';
import { EmailThrottlerGuard } from '../guards/email-throttler.guard';

const REFRESH_COOKIE_NAME = 'marche_refresh_token';

// Tighter limit for the endpoints a brute-force/credential-stuffing attempt
// would actually target — the global 100/min default (app.module.ts) is too
// loose to stop rapid password guessing on its own. See auth-rate-limit.ts
// for the override and its reasoning.
const AUTH_THROTTLE = { default: { limit: AUTH_RATE_LIMIT, ttl: AUTH_RATE_LIMIT_TTL_MS } };

function requestContext(req: Request) {
  return { userAgent: req.headers['user-agent'], ipAddress: req.ip };
}

// The refresh token is only ever readable by the browser via this cookie —
// never handed back in a JSON body — so it can't be exfiltrated by an XSS
// payload the way a JS-accessible token could (CLAUDE.md security rule).
//
// CSRF: no separate token here. The cookie is scoped to path /auth so it is
// never attached to a state-changing business route in the first place, those
// routes authenticate with a bearer header instead, and CORS is locked to the
// exact FRONTEND_ORIGIN so a forged request couldn't read the response. A double-submit
// CSRF token was tried and reverted — it fundamentally conflicts with
// restoring a session silently on page load (the frontend has no token to
// send on that very first /auth/refresh call, since one is only ever handed
// out in a login/refresh response, and in-memory state doesn't survive a
// reload) and adds real complexity for protection that's already redundant
// with path scoping+CORS given how narrowly these two cookies are used.
//
// SameSite has to be 'none' in production: the web app is served from a
// different origin than the API there (FRONTEND_ORIGIN in render.yaml), so a
// Strict cookie is never sent on /auth/refresh and every session dies
// silently the moment the 15-minute access token expires. 'none' only works
// paired with Secure — browsers drop the cookie otherwise — which costs
// nothing, production is HTTPS. Development stays Strict: localhost:5173 and
// localhost:4000 are same-site, so there is nothing to gain by relaxing it.
//
// What that gives up is the browser-level guarantee that this cookie is never
// attached to a cross-site-triggered request. The defences listed above carry
// it instead: /auth is the only path the cookie reaches, every state-changing
// business route reads a bearer header an attacker's page cannot forge, and
// CORS won't let a forged /auth/refresh read its own response. The worst such
// a request achieves is rotating the victim's refresh token into a body the
// attacker never sees.
export function refreshCookieOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('strict' as const),
    path: '/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
  };
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
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
  @UseGuards(EmailThrottlerGuard)
  @ApiOperation({
    summary:
      'Create an account and send a verification email (always 201 with the same body, whether or not the address was already registered)',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle(AUTH_THROTTLE)
  @UseGuards(EmailThrottlerGuard)
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
  @UseGuards(EmailThrottlerGuard)
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
