import type { WDIOBrowser } from '../driver';
import { logger } from '../utils/logger';
import { sleep, randomRange, adb } from '../utils/adb';

/**
 * Spend 30-90s simulating a real user: scroll the home feed, like a random tweet or two.
 * Should be called after switching account, before any "hot" action (post/comment).
 */
export async function warmup(driver: WDIOBrowser, durationMs = 45_000): Promise<void> {
    logger.info(`[warmup] starting ~${Math.round(durationMs / 1000)}s`);
    const deadline = Date.now() + durationMs;
    let scrolls = 0;
    while (Date.now() < deadline) {
        // Swipe up (scroll feed)
        const { width, height } = await getScreenSize();
        const startY = Math.floor(height * (0.65 + Math.random() * 0.2));
        const endY = Math.floor(height * (0.2 + Math.random() * 0.2));
        const x = Math.floor(width * (0.4 + Math.random() * 0.2));
        adb(['shell', 'input', 'swipe', `${x}`, `${startY}`, `${x}`, `${endY}`, '350']);
        scrolls++;
        await sleep(randomRange(2500, 5500));
    }
    logger.info(`[warmup] done (${scrolls} scrolls)`);
}

async function getScreenSize(): Promise<{ width: number; height: number }> {
    const out = adb(['shell', 'wm', 'size']); // e.g. "Physical size: 1080x2400"
    const match = out.match(/(\d+)x(\d+)/);
    if (!match) return { width: 1080, height: 2400 };
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
}
