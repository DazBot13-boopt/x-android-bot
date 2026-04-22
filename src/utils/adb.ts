import { execSync, spawnSync } from 'child_process';
import { config } from '../config';

function adbBase(): string[] {
    return config.android.deviceSerial ? ['-s', config.android.deviceSerial] : [];
}

export function adb(args: string[], timeoutMs = 10000): string {
    const res = spawnSync('adb', [...adbBase(), ...args], {
        timeout: timeoutMs,
        encoding: 'utf-8',
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
        throw new Error(`adb ${args.join(' ')} failed: ${res.stderr}`);
    }
    return res.stdout;
}

export function listDevices(): { serial: string; state: string }[] {
    const out = execSync('adb devices', { encoding: 'utf-8' });
    return out
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean)
        .filter((l) => !l.startsWith('*'))
        .map((l) => {
            const [serial, state] = l.split(/\s+/);
            return { serial, state };
        });
}

export function ensureAppForeground(packageName: string) {
    adb(['shell', 'am', 'start', '-n', `${packageName}/${config.android.xAppActivity}`]);
}

export function dumpUiHierarchy(): string {
    // uiautomator dump can take 20–30 s on complex screens (composer, long threads);
    // give it some slack so short-default timeouts don't kill legitimate dumps.
    adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml'], 60_000);
    const xml = adb(['shell', 'cat', '/sdcard/window_dump.xml'], 30_000);
    return xml;
}

/**
 * Sends a real touch event at (x, y) via `adb shell input tap`.
 * Use this for elements whose own node is clickable=false but whose parent
 * is clickable — webdriverio's .click() on the child sometimes doesn't bubble
 * to the clickable ancestor, whereas a physical coord-tap always does.
 */
export function coordTap(x: number, y: number): void {
    adb(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
}

/**
 * Parses a UIAutomator bounds string like "[528,152][576,200]" into a
 * centered (x, y) coordinate pair. Returns null on malformed input.
 */
export function parseBoundsCenter(bounds: string): { x: number; y: number } | null {
    const m = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    if (!m) return null;
    const [, x1, y1, x2, y2] = m.map(Number);
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export function randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
