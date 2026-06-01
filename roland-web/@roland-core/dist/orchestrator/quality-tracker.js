/**
 * Model A/B Quality Tracker
 *
 * Tracks quality signals (accept/retry/reject/manual_fix) per model so Roland
 * can learn which models work best for a given codebase and adjust routing.
 *
 * Persists to .roland/model-quality.json as a JSON array of QualityRecord.
 * Max 1000 records — oldest are dropped when exceeded.
 */
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
// ============================================================================
// QualityTracker
// ============================================================================
const MAX_RECORDS = 1000;
export class QualityTracker {
    qualityPath;
    rolandDir;
    records;
    constructor(projectRoot) {
        this.rolandDir = path.join(projectRoot, '.roland');
        this.qualityPath = path.join(this.rolandDir, 'model-quality.json');
        this.records = this.loadSync();
    }
    // --------------------------------------------------------------------------
    // Persistence
    // --------------------------------------------------------------------------
    loadSync() {
        try {
            if (fs.existsSync(this.qualityPath)) {
                const raw = fs.readFileSync(this.qualityPath, 'utf-8');
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            }
        }
        catch {
            logger.warn('[QualityTracker] Corrupt model-quality.json — starting fresh');
        }
        return [];
    }
    async save() {
        try {
            if (!fs.existsSync(this.rolandDir)) {
                await fs.promises.mkdir(this.rolandDir, { recursive: true });
            }
            const tmpPath = this.qualityPath + '.tmp';
            await fs.promises.writeFile(tmpPath, JSON.stringify(this.records, null, 2), 'utf-8');
            await fs.promises.rename(tmpPath, this.qualityPath);
        }
        catch (error) {
            logger.error(`[QualityTracker] Failed to save: ${error}`);
        }
    }
    // --------------------------------------------------------------------------
    // Core API
    // --------------------------------------------------------------------------
    /**
     * Append a quality signal for a model response.
     */
    async recordSignal(model, provider, taskType, tier, signal, retryModel) {
        const record = {
            timestamp: new Date().toISOString(),
            model,
            provider,
            task_type: taskType,
            complexity_tier: tier,
            signal,
            ...(retryModel ? { retry_model: retryModel } : {}),
        };
        this.records.push(record);
        // Trim oldest records if over limit
        if (this.records.length > MAX_RECORDS) {
            this.records = this.records.slice(this.records.length - MAX_RECORDS);
        }
        await this.save();
    }
    /**
     * Compute quality stats for one model or all models.
     */
    getModelQuality(model) {
        if (model) {
            return this.computeQuality(model);
        }
        const models = Array.from(new Set(this.records.map(r => r.model)));
        return models.map(m => this.computeQuality(m));
    }
    /**
     * Rank models by accept_rate for a given tier.
     * Only models with > 10 signals in that tier are included.
     */
    getRecommendation(tier) {
        const tierRecords = this.records.filter(r => r.complexity_tier === tier);
        const models = Array.from(new Set(tierRecords.map(r => r.model)));
        return models
            .map(model => {
            const modelRecords = tierRecords.filter(r => r.model === model);
            if (modelRecords.length <= 10)
                return null;
            const accepts = modelRecords.filter(r => r.signal === 'accept').length;
            const score = accepts / modelRecords.length;
            return { model, score };
        })
            .filter((x) => x !== null)
            .sort((a, b) => b.score - a.score);
    }
    /**
     * Return all records (copy).
     */
    getRecords() {
        return [...this.records];
    }
    /**
     * Reset all records.
     */
    clear() {
        this.records = [];
    }
    // --------------------------------------------------------------------------
    // Internal helpers
    // --------------------------------------------------------------------------
    computeQuality(model) {
        const modelRecords = this.records.filter(r => r.model === model);
        const total = modelRecords.length;
        if (total === 0) {
            return {
                model,
                total_tasks: 0,
                accept_rate: 0,
                retry_rate: 0,
                reject_rate: 0,
                manual_fix_rate: 0,
                best_task_types: [],
                worst_task_types: [],
            };
        }
        const countSignal = (s) => modelRecords.filter(r => r.signal === s).length;
        const accept_rate = countSignal('accept') / total;
        const retry_rate = countSignal('retry') / total;
        const reject_rate = countSignal('reject') / total;
        const manual_fix_rate = countSignal('manual_fix') / total;
        // Per-tier accept rates (min 5 signals)
        const tiers = Array.from(new Set(modelRecords.map(r => r.complexity_tier)));
        const best_task_types = [];
        const worst_task_types = [];
        for (const tier of tiers) {
            const tierRecords = modelRecords.filter(r => r.complexity_tier === tier);
            if (tierRecords.length < 5)
                continue;
            const tierAcceptRate = tierRecords.filter(r => r.signal === 'accept').length / tierRecords.length;
            if (tierAcceptRate > 0.7) {
                best_task_types.push(tier);
            }
            else if (tierAcceptRate < 0.4) {
                worst_task_types.push(tier);
            }
        }
        return {
            model,
            total_tasks: total,
            accept_rate,
            retry_rate,
            reject_rate,
            manual_fix_rate,
            best_task_types,
            worst_task_types,
        };
    }
}
// ============================================================================
// Singleton
// ============================================================================
let globalQualityTracker = null;
/**
 * Get the global QualityTracker instance.
 * Returns null if not yet initialized.
 */
export function getGlobalQualityTracker() {
    return globalQualityTracker;
}
/**
 * Initialize the global QualityTracker with a project root.
 */
export function initializeQualityTracker(projectRoot) {
    globalQualityTracker = new QualityTracker(projectRoot);
    return globalQualityTracker;
}
//# sourceMappingURL=quality-tracker.js.map