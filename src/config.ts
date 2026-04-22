import 'dotenv/config';

export const config = {
    redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
    },
    queueName: process.env.QUEUE_NAME || 'twitter-actions',
    appium: {
        host: process.env.APPIUM_HOST || '127.0.0.1',
        port: parseInt(process.env.APPIUM_PORT || '4723', 10),
    },
    android: {
        deviceSerial: process.env.ANDROID_DEVICE_SERIAL || undefined,
        xAppPackage: process.env.X_APP_PACKAGE || 'com.twitter.android',
        xAppActivity: process.env.X_APP_ACTIVITY || 'com.twitter.android.StartActivity',
    },
    /**
     * Optional: @handle (without the leading @) of the account currently
     * logged in as the active profile on the attached device. When set and
     * equal to the `--username` requested for a job, switchAccount() skips
     * all UI interaction and returns immediately. Ideal for single-account
     * devices where the drawer + account-switcher flow is pure overhead.
     */
    activeAccount: process.env.X_ACTIVE_ACCOUNT
        ? process.env.X_ACTIVE_ACCOUNT.replace(/^@/, '').trim()
        : undefined,
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
};
