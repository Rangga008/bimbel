import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuditModule } from './common/audit/audit.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PeopleModule } from './modules/people/people.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { GroupsModule } from './modules/groups/groups.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { BudgetModule } from './modules/budget/budget.module';
import { ExpenseModule } from './modules/expenses/expense.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { ContentCategoriesModule } from './modules/content-categories/content-categories.module';
import { LatsolModule } from './modules/latsol/latsol.module';
import { ExamsModule } from './modules/exams/exams.module';
import { ExamAttemptsModule } from './modules/exam-attempts/exam-attempts.module';
import { ExamProctoringModule } from './modules/exam-proctoring/exam-proctoring.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ScoreRulesModule } from './modules/score-rules/score-rules.module';
import { PointTransactionsModule } from './modules/point-transactions/point-transactions.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MediaModule } from './modules/media/media.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { ImportsModule } from './modules/imports/imports.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { TutorScopeModule } from './common/tutor-scope/tutor-scope.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Muat apps/api/.env saat dijalankan native (node dist/main.js) —
      // di Docker, env disuntik via compose sehingga file ini sekadar fallback.
      envFilePath: ['apps/api/.env', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorage, ConfigService],
      useFactory: (storage: RedisThrottlerStorage, config: ConfigService) => ({
        throttlers: [
          {
            ttl: Number(config.get('THROTTLE_TTL_MS', '60000')),
            limit: Number(config.get('THROTTLE_LIMIT', '100')),
          },
        ],
        storage,
      }),
    }),
    PrismaModule,
    AuditModule,
    RedisModule,
    AuthModule,
    UsersModule,
    RbacModule,
    DashboardModule,
    PeopleModule,
    ProgramsModule,
    GroupsModule,
    SchedulesModule,
    AttendanceModule,
    NotificationsModule,
    InvoicesModule,
    PaymentsModule,
    EnrollmentsModule,
    RefundsModule,
    BudgetModule,
    ExpenseModule,
    ReportsModule,
    MaterialsModule,
    QuestionsModule,
    ContentCategoriesModule,
    LatsolModule,
    ExamsModule,
    ExamAttemptsModule,
    ExamProctoringModule,
    AnalyticsModule,
    ScoreRulesModule,
    PointTransactionsModule,
    PayrollModule,
    WhatsAppModule,
    SettingsModule,
    MediaModule,
    MailerModule,
    ImportsModule,
    MasterDataModule,
    FeedbackModule,
    TutorScopeModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
