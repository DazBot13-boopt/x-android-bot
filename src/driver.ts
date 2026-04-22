import { remote, Browser } from 'webdriverio';
import { config } from './config';
import { logger } from './utils/logger';
import { listDevices } from './utils/adb';

export type WDIOBrowser = Browser;

let driverPromise: Promise<WDIOBrowser> | null = null;

function resolveDeviceSerial(): string {
    if (config.android.deviceSerial) return config.android.deviceSerial;
    const devices = listDevices().filter((d) => d.state === 'device');
    if (devices.length === 0) {
        throw new Error('No authorized Android device. Run `adb devices`.');
    }
    if (devices.length > 1) {
        logger.warn(
            `Multiple devices found (${devices.map((d) => d.serial).join(', ')}), picking ${devices[0].serial}. ` +
                `Set ANDROID_DEVICE_SERIAL in .env to pin it.`
        );
    }
    return devices[0].serial;
}

export function getDriver(): Promise<WDIOBrowser> {
    if (!driverPromise) {
        const udid = resolveDeviceSerial();
        logger.info(`Starting Appium session on device ${udid}...`);
        driverPromise = remote({
            hostname: config.appium.host,
            port: config.appium.port,
            path: '/',
            logLevel: 'warn',
            capabilities: {
                platformName: 'Android',
                'appium:automationName': 'UiAutomator2',
                'appium:udid': udid,
                'appium:appPackage': config.android.xAppPackage,
                'appium:appActivity': config.android.xAppActivity,
                'appium:noReset': true,
                'appium:fullReset': false,
                'appium:dontStopAppOnReset': true,
                'appium:newCommandTimeout': 300,
            },
        });
    }
    return driverPromise;
}

export async function resetDriver(): Promise<void> {
    if (!driverPromise) return;
    try {
        const d = await driverPromise;
        await d.deleteSession();
    } catch (err) {
        logger.warn('Error closing driver session:', err);
    }
    driverPromise = null;
}
