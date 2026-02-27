const isDev = process.env.NODE_ENV !== 'production';

const formatMessage = (level, message, details = null) => {
    const timestamp = new Date().toISOString();
    let log = `[${timestamp}] [${level}] ${message}`;
    if (details) {
        if (details instanceof Error) {
            log += `\nError: ${details.message}\nStack: ${details.stack}`;
        } else {
            log += `\nDetails: ${JSON.stringify(details, null, 2)}`;
        }
    }
    return log;
};

export const logger = {
    info: (message, details) => {
        console.log(formatMessage('INFO', message, details));
    },
    warn: (message, details) => {
        console.warn(formatMessage('WARN', message, details));
    },
    error: (message, details) => {
        console.error(formatMessage('ERROR', message, details));
    },
    debug: (message, details) => {
        if (isDev) {
            console.log(formatMessage('DEBUG', message, details));
        }
    }
};
