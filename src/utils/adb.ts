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
    adb(['shell', 'uiautomator', 'dump', '/sdcard/window_dump.xml']);
    const xml = adb(['shell', 'cat', '/sdcard/window_dump.xml']);
    return xml;
}

export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export function randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}
