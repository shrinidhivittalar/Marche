import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

// Global so any module can inject AuditService without re-importing this
// module everywhere — same pattern as PrismaModule.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
