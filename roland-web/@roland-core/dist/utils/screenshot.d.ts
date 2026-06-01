/**
 * Screenshot utilities for Roland's analyze_screenshot MCP tool.
 *
 * Captures the primary screen (Windows via PowerShell, macOS via screencapture,
 * Linux via scrot/gnome-screenshot) and/or reads an existing image file,
 * then sends it to a vision-capable model on OpenRouter for analysis.
 */
export interface ScreenshotAnalysisOptions {
    /** Path to an existing image file. If omitted, a screenshot is captured. */
    filePath?: string;
    /** Analysis prompt / question about the image. */
    prompt?: string;
    /** OpenRouter vision model to use. Defaults to gemini-2.5-flash (fast + free tier). */
    model?: string;
    /** OpenRouter API key. Falls back to OPENROUTER_API_KEY env var. */
    apiKey?: string;
}
export interface ScreenshotAnalysisResult {
    analysis: string;
    model: string;
    imagePath: string;
    capturedNow: boolean;
}
/**
 * Capture the primary screen to a temp PNG file and return its path.
 */
export declare function captureScreen(): string;
/**
 * Send an image file to a vision-capable model on OpenRouter and return the
 * text response.
 */
export declare function analyzeImageWithVision(imagePath: string, prompt: string, model: string, apiKey: string): Promise<string>;
/**
 * Capture (or load) an image and return an AI analysis of it.
 */
export declare function analyzeScreenshot(opts?: ScreenshotAnalysisOptions): Promise<ScreenshotAnalysisResult>;
//# sourceMappingURL=screenshot.d.ts.map