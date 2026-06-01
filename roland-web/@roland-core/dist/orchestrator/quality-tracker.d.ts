/**
 * Model A/B Quality Tracker
 *
 * Tracks quality signals (accept/retry/reject/manual_fix) per model so Roland
 * can learn which models work best for a given codebase and adjust routing.
 *
 * Persists to .roland/model-quality.json as a JSON array of QualityRecord.
 * Max 1000 records — oldest are dropped when exceeded.
 */
export interface QualityRecord {
    timestamp: string;
    model: string;
    provider: string;
    task_type: string;
    complexity_tier: string;
    signal: 'accept' | 'retry' | 'reject' | 'manual_fix';
    retry_model?: string;
}
export interface ModelQuality {
    model: string;
    total_tasks: number;
    accept_rate: number;
    retry_rate: number;
    reject_rate: number;
    manual_fix_rate: number;
    best_task_types: string[];
    worst_task_types: string[];
}
export declare class QualityTracker {
    private readonly qualityPath;
    private readonly rolandDir;
    private records;
    constructor(projectRoot: string);
    private loadSync;
    private save;
    /**
     * Append a quality signal for a model response.
     */
    recordSignal(model: string, provider: string, taskType: string, tier: string, signal: 'accept' | 'retry' | 'reject' | 'manual_fix', retryModel?: string): Promise<void>;
    /**
     * Compute quality stats for one model or all models.
     */
    getModelQuality(model?: string): ModelQuality | ModelQuality[];
    /**
     * Rank models by accept_rate for a given tier.
     * Only models with > 10 signals in that tier are included.
     */
    getRecommendation(tier: string): Array<{
        model: string;
        score: number;
    }>;
    /**
     * Return all records (copy).
     */
    getRecords(): QualityRecord[];
    /**
     * Reset all records.
     */
    clear(): void;
    private computeQuality;
}
/**
 * Get the global QualityTracker instance.
 * Returns null if not yet initialized.
 */
export declare function getGlobalQualityTracker(): QualityTracker | null;
/**
 * Initialize the global QualityTracker with a project root.
 */
export declare function initializeQualityTracker(projectRoot: string): QualityTracker;
//# sourceMappingURL=quality-tracker.d.ts.map