import { startWorker } from './queue';
import { listDevices } from './utils/adb';
import { logger } from './utils/logger';

async function main() {
    logger.info('x-android-bot starting…');

    const devices = listDevices();
    if (devices.length === 0) {
        logger.error('No Android device detected via ADB. Plug your phone in USB, authorize debugging, then retry.');
        process.exit(1);
    }
    logger.info(`ADB devices: ${devices.map((d) => `${d.serial}(${d.state})`).join(', ')}`);

    const worker = startWorker();

    process.on('SIGINT', async () => {
        logger.info('Shutting down…');
        await worker.close();
        process.exit(0);
    });
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});
