// Consumer antrean "points.award" — pencatatan poin ujian/latsol diproses
// di luar request path submit sehingga respons submit cepat. Aman dipicu
// ulang: createExamTransaction/createLatsolTransaction idempotent
// (advisory lock + unique index + cek existing).
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from '../../common/queue/queue.service';
import { PointTransactionsService } from './point-transactions.service';

export const POINT_AWARD_QUEUE = 'points.award';

export interface PointAwardMessage {
  kind: 'exam' | 'latsol';
  attemptId: string;
}

@Injectable()
export class PointAwardConsumer implements OnModuleInit {
  private readonly logger = new Logger(PointAwardConsumer.name);

  constructor(
    private readonly queue: QueueService,
    private readonly points: PointTransactionsService,
  ) {}

  onModuleInit() {
    if (!this.queue.enabled) return;
    this.queue.consume(POINT_AWARD_QUEUE, async (payload) => {
      const { kind, attemptId } = payload as Partial<PointAwardMessage>;
      if (typeof attemptId !== 'string' || !attemptId) return;
      if (kind === 'exam') {
        await this.points.createExamTransaction(attemptId);
      } else if (kind === 'latsol') {
        await this.points.createLatsolTransaction(attemptId);
      }
    });
    this.logger.log('Consumer poin via RabbitMQ aktif.');
  }
}
