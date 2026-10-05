import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisThrottlerStorage } from './redis-throttler.storage';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: 1,
          // Jangan blokir bootstrap Nest saat Redis mati (dev lokal tanpa redis).
          // Kegagalan operasi ditangani di RedisThrottlerStorage (fallback in-memory).
          lazyConnect: true,
          enableReadyCheck: false,
        });
        redis.on('error', () => {
          // Sengaja ditelan — sudah di-log + fallback di storage layer.
        });
        // Coba connect di background; abaikan jika gagal.
        redis.connect().catch(() => undefined);
        return redis;
      },
    },
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisThrottlerStorage],
})
export class RedisModule {}
