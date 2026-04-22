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
    workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
};
