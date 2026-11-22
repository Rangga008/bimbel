export interface LeaderboardEntry {
	rank: number;
	studentId: string;
	studentName: string;
	avatarUrl?: string | null;
	schoolOrigin?: string | null;
	groupNames: string[];
	totalPoints: number;
	transactionCount: number;
}
