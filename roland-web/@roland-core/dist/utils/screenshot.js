/**
 * Screenshot utilities for Roland's analyze_screenshot MCP tool.
 *
 * Captures the primary screen (Windows via PowerShell, macOS via screencapture,
 * Linux via scrot/gnome-screenshot) and/or reads an existing image file,
 * then sends it to a vision-capable model on OpenRouter for analysis.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
// ============================================================================
// Screen capture
// ============================================================================
const DEFAULT_VISION_MODEL = 'google/gemini-2.5-flash';
/**
 * Capture the primary screen to a temp PNG file and return its path.
 */
export function captureScreen() {
    const outPath = path.join(os.tmpdir(), `roland-screenshot-${Date.now()}.png`);
    const platform = process.platform;
    if (platform === 'win32') {
        // PowerShell one-liner — works on all modern Windows versions
        const ps = [
            `Add-Type -AssemblyName System.Windows.Forms;`,
            `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;`,
            `$bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height);`,
            `$g = [System.Drawing.Graphics]::FromImage($bmp);`,
            `$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size);`,
            `$bmp.Save('${outPath.replace(/\\/g, '\\\\')}');`,
        ].join(' ');
        execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'pipe' });
    }
    else if (platform === 'darwin') {
        execSync(`screencapture -x "${outPath}"`, { stdio: 'pipe' });
    }
    else {
        // Linux — try scrot, fall back to gnome-screenshot
        try {
            execSync(`scrot "${outPath}"`, { stdio: 'pipe' });
        }
        catch {
            execSync(`gnome-screenshot -f "${outPath}"`, { stdio: 'pipe' });
        }
    }
    if (!fs.existsSync(outPath)) {
        throw new Error(`Screen capture failed — output file not created: ${outPath}`);
    }
    return outPath;
}
// ============================================================================
// Vision API call
// ============================================================================
/**
 * Send an image file to a vision-capable model on OpenRouter and return the
 * text response.
 */
export async function analyzeImageWithVision(imagePath, prompt, model, apiKey) {
    const imageData = fs.readFileSync(imagePath);
    const base64 = imageData.toString('base64');
    // Detect MIME type from extension
    const ext = path.extname(imagePath).toLowerCase();
    const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    };
    const mimeType = mimeMap[ext] ?? 'image/png';
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://github.com/rolandai/roland',
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: `data:${mimeType};base64,${base64}` },
                        },
                        {
                            type: 'text',
                            text: prompt,
                        },
                    ],
                },
            ],
            max_tokens: 2048,
        }),
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenRouter vision API error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.choices[0]?.message?.content ?? '(no response)';
}
// ============================================================================
// Main entry point
// ============================================================================
/**
 * Capture (or load) an image and return an AI analysis of it.
 */
export async function analyzeScreenshot(opts = {}) {
    const { filePath, prompt = 'Describe what you see in this image in detail. Focus on any code, error messages, UI elements, or anything relevant to software development.', model = DEFAULT_VISION_MODEL, apiKey = process.env['OPENROUTER_API_KEY'] ?? '', } = opts;
    if (!apiKey) {
        throw new Error('OPENROUTER_API_KEY is required for screenshot analysis.');
    }
    let imagePath;
    let capturedNow = false;
    if (filePath) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Image file not found: ${filePath}`);
        }
        imagePath = filePath;
    }
    else {
        imagePath = captureScreen();
        capturedNow = true;
    }
    const analysis = await analyzeImageWithVision(imagePath, prompt, model, apiKey);
    // Clean up temp file if we captured it
    if (capturedNow) {
        try {
            fs.unlinkSync(imagePath);
        }
        catch { /* best-effort */ }
    }
    return { analysis, model, imagePath, capturedNow };
}
//# sourceMappingURL=screenshot.js.map