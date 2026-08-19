import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { PaymentsService } from '../services/payments.service';
import { RazorpayClient } from '../razorpay/razorpay.client';

// No JwtAuthGuard — Razorpay, not a logged-in user, calls this. Trust comes
// entirely from the signature check below, not from auth middleware.
// Excluded from Swagger for the same reason /auth routes aren't meant for
// manual poking: this is a machine-to-machine contract, not a UI-driven one.
@ApiExcludeController()
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly razorpay: RazorpayClient,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !signature) {
      throw new BadRequestException('Missing webhook body or signature');
    }

    // The whole point of a webhook signature: without this, anyone who
    // finds this URL could POST a fake "payment.captured" and get a
    // connection marked paid for free.
    const valid = this.razorpay.verifyWebhookSignature(rawBody.toString('utf8'), signature);
    if (!valid) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: { payment?: { entity?: { order_id?: string; id?: string } } };
    };
    const entity = payload.payload?.payment?.entity;
    if (entity?.order_id && entity?.id) {
      await this.paymentsService.handleWebhookEvent(payload.event, entity.order_id, entity.id);
    }

    return { received: true };
  }
}
