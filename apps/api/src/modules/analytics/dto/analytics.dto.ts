/**
 * Fase 4a — Analytics DTOs
 * Per-question analytics & student performance dashboard
 */

// Per-question analytics response
export class QuestionAnalyticsDto {
  questionId: string;
  questionContent: string;
  questionType: string;
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number; // percentage 0-100
  optionDistribution: OptionDistributionDto[];
  avgResponseTimeMs?: number; // average time spent on this question
}

export class OptionDistributionDto {
  optionId: string;
  optionContent: string;
  isCorrect: boolean;
  selectedCount: number;
  selectionRate: number; // percentage 0-100
}

// Student performance dashboard response
export class StudentPerformanceDto {
  studentId: string;
  studentName: string;
  examHistory: ExamHistoryItemDto[];
  topicAnalysis: TopicAnalysisDto[];
  overallStats: OverallStatsDto;
}

export class ExamHistoryItemDto {
  examId: string;
  examTitle: string;
  examDate: Date;
  score: number;
  maxScore: number;
  percentage: number;
  rank?: number;
  totalParticipants?: number;
}

export class TopicAnalysisDto {
  topicId?: string;
  topicName: string; // derived from program/level/difficulty
  totalQuestions: number;
  correctCount: number;
  accuracy: number;
  avgScore: number;
  weaknessLevel: 'STRONG' | 'AVERAGE' | 'WEAK';
}

export class OverallStatsDto {
  totalExams: number;
  totalQuestionsAttempted: number;
  overallAccuracy: number;
  avgScore: number;
  avgPercentage: number;
  bestExam: ExamHistoryItemDto;
  worstExam: ExamHistoryItemDto;
}

// Analytics query filters
export class AnalyticsQueryDto {
  examId?: string;
  questionId?: string;
  studentId?: string;
  programId?: string;
  levelId?: string;
  startDate?: Date;
  endDate?: Date;
}
