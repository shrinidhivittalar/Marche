import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../identity/guards/jwt-auth.guard';
import { CurrentUser } from '../../identity/current-user.decorator';
import type { AuthenticatedUser } from '../../identity/strategies/jwt.strategy';
import { ProposalsService } from '../services/proposals.service';
import { CreateProposalDto } from '../dto/proposal.dto';
import { AttachFileDto } from '../../jobs/dto/attach-file.dto';
import { PaginationQueryDto } from '../../profiles/dto/pagination-query.dto';

// Every route here is authenticated. Nothing about a proposal is public —
// not the list, not a single one, not an attachment, not a count — which is
// the difference between this controller and the jobs one, where discovery
// is deliberately open.
@ApiTags('proposals')
@Controller('proposals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  // ---------------------------------------------------------------------
  // Route order is load-bearing. Nest matches in declaration order, so the
  // literal 'me' path must be declared before ':id' — otherwise a request
  // to /proposals/me is captured by the parameterised route and "me" is
  // treated as a proposal id. Same trap as the jobs and services
  // controllers; covered by a test.
  // ---------------------------------------------------------------------

  @Get('me')
  @ApiOperation({
    summary: "The caller's own proposals, in every state",
    description: 'Provider-side. Each carries the requirement it was made against.',
  })
  listMine(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.proposalsService.listMine(user.id, pagination);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'One proposal, readable by either party to it',
    description:
      'The provider who wrote it sees the requirement it targets; the client who received ' +
      'it sees who is offering. Nobody else has access, and neither side sees the ' +
      'competition.',
  })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proposalsService.findById(user.id, id);
  }

  @Post()
  @ApiOperation({
    summary: 'Submit a proposal on a published requirement (Provider only)',
    description:
      'One per provider per requirement, ever. The requirement must be published, not ' +
      'cancelled or filled, and still inside its proposal deadline.',
  })
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProposalDto) {
    return this.proposalsService.submit(user.id, dto);
  }

  // Each decision gets its own route rather than being a status field on an
  // update DTO, so a lifecycle change has one auditable path — and so no
  // caller can set a status directly. There is no PATCH: a submitted
  // proposal is immutable except for withdrawal.
  @Post(':id/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Withdraw your own proposal (Provider only)',
    description:
      'Final for that requirement — you cannot propose on it again. Fails with 409 if the ' +
      'client has already accepted or rejected it.',
  })
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.proposalsService.withdraw(user.id, id);
  }

  @Post(':id/accept')
  @ApiOperation({
    summary: 'Accept a proposal on your own requirement (Client only)',
    description:
      'Fills the requirement, rejects every competing proposal, and establishes the ' +
      'connection — all or nothing. Returns the connection. Fails with 409 if the ' +
      'requirement was already filled or the proposal was withdrawn.',
  })
  accept(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proposalsService.accept(user.id, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Reject a proposal on your own requirement (Client only)',
    description: 'Rejecting every proposal is valid — the requirement stays open.',
  })
  async reject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.proposalsService.reject(user.id, id);
  }

  // Attachments live under the proposal that owns them, so the route carries
  // both ids and neither can be checked in isolation.
  @Get(':id/attachments')
  @ApiOperation({
    summary: 'Files on a proposal, as short-lived signed URLs',
    description:
      'Readable by the provider who attached them and the client deciding on them. ' +
      'Nothing is served from storage directly.',
  })
  listAttachments(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.proposalsService.listAttachments(user.id, id);
  }

  @Post(':id/attachments')
  @ApiOperation({
    summary: 'Attach an uploaded file to your own proposal',
    description:
      'The file must belong to you and have finished uploading. It becomes private on ' +
      'attach. Only while the proposal is still undecided.',
  })
  addAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AttachFileDto,
  ) {
    return this.proposalsService.addAttachment(user.id, id, dto.mediaId);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Detach a file from your own proposal',
    description: 'The file itself is kept — it belongs to you, not to the proposal.',
  })
  async removeAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    await this.proposalsService.removeAttachment(user.id, id, attachmentId);
  }
}
