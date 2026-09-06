import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiUserThrottlerGuard } from './guards/ai-user-throttler.guard';

@Module({
  providers: [AiService, AiUserThrottlerGuard],
  exports: [AiService, AiUserThrottlerGuard],
})
export class AiModule {}
