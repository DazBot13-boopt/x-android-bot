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

/**
 * Dumps the current window's UI hierarchy. Tries `--compressed` first
 * (which skips non-important views and, crucially, doesn't wait for the
 * window to be idle — so it works even when the soft keyboard is open on
 * the composer). Falls back to the normal dump on failure.
 *
 * We also proactively hide the soft keyboard before the call when it is
 * up, since that's the #1 cause of the dump hanging on the composer.
 */
export function dumpUiHierarchy(): string {
    hideSoftKeyboardIfOpen();

    // 1st try: compressed. Much faster, and doesn't require window-idle.
    try {
        adb(['shell', 'uiautomator', 'dump', '--compressed', '/sdcard/window_dump.xml'], 45_000);
    } catch (err) {
        // Fall back to a plain dump (older UIAutomator versions don't know --compressed).
        adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml'], 90_000);
    }
    return adb(['shell', 'cat', '/sdcard/window_dump.xml'], 30_000);
}

/**
 * `dumpsys input_method` returns `mInputShown=true` when the soft keyboard
 * is visible. In that state `uiautomator dump` (without --compressed) hangs
 * waiting for the window to be idle. Hitting KEYCODE_BACK once hides the
 * IME without leaving the current activity (standard Android IME behaviour).
 */
function hideSoftKeyboardIfOpen(): void {
    try {
        const out = adb(['shell', 'dumpsys', 'input_method'], 10_000);
        if (/mInputShown=true/.test(out)) {
            // BACK first hides the keyboard; it only pops the activity if the
            // keyboard is already hidden.
            adb(['shell', 'input', 'keyevent', '4'], 5_000);
        }
    } catch {
        // Best-effort only.
    }
}

/**
 * Returns the device's physical screen size via `adb shell wm size`.
 * Output looks like "Physical size: 720x1600" (optionally followed by an
 * override size on a second line). We cache the result per-process since
 * the physical size never changes.
 */
let _cachedScreenSize: { width: number; height: number } | null = null;
export function getScreenSize(): { width: number; height: number } {
    if (_cachedScreenSize) return _cachedScreenSize;
    const out = adb(['shell', 'wm', 'size'], 10_000);
    // Prefer "Override size" when present (reflects what apps actually see).
    const over = out.match(/Override size:\s*(\d+)x(\d+)/);
    const phys = out.match(/Physical size:\s*(\d+)x(\d+)/);
    const m = over || phys;
    if (!m) throw new Error(`wm size: unable to parse "${out.trim()}"`);
    _cachedScreenSize = { width: Number(m[1]), height: Number(m[2]) };
    return _cachedScreenSize;
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
