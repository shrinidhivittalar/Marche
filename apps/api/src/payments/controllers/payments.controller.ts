import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { PaymentsService } from '../services/payments.service';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';

// Nested under /connections/:id, not a top-level /payments — a payment has
// no identity or existence independent of the one connection it settles,
// same reasoning as ConnectionDisputesController for disputes.
@ApiTags('payments')
@Controller('connections/:id/payment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('order')
  @ApiOperation({
    summary: 'Start (or resume) payment for this connection (Client only)',
    description:
      'Creates a Razorpay order for the agreed amount. Safe to call again on an ' +
      'abandoned checkout — it resumes the same payment record rather than opening a second one.',
  })
  createOrder(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.createOrder(user.id, id);
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Confirm a completed Razorpay checkout (Client only)',
    description:
      "Called by the frontend from Checkout.js's success handler. The signature is verified " +
      'server-side before anything is marked paid; the webhook is the authoritative fallback ' +
      'if this call never happens (closed tab, dropped connection).',
  })
  verify(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyCallback(
      user.id,
      id,
      dto.razorpayOrderId,
      dto.razorpayPaymentId,
      dto.razorpaySignature,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Payment status for this connection, readable by either party' })
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.paymentsService.getStatus(user.id, id);
  }

  @Get('invoice')
  @ApiOperation({
    summary: 'A plain payment-record PDF for this connection, readable by either party',
    description:
      'Only available once the connection has been paid. Not a GST tax invoice — a record of ' +
      'the amount agreed and paid, generated fresh on every request rather than stored.',
  })
  async getInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const pdf = await this.paymentsService.generateInvoicePdf(user.id, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${id}.pdf"`,
      'Content-Length': String(pdf.length),
    });
    res.send(pdf);
  }
}
