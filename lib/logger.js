/**
 * Isomorphic Logger for Dashboard Resilience
 * Handles silent failure logging on client and structured logging on server.
 */

const isServer = typeof window === 'undefined'

const logger = {
    info: (msg, data = {}) => {
        if (isServer) {
            console.log(`[INFO] ${msg}`, JSON.stringify(data))
        } else {
            console.info(`[INFO] ${msg}`, data)
        }
    },

    warn: (msg, data = {}) => {
        if (isServer) {
            console.warn(`[WARN] ${msg}`, JSON.stringify(data))
        } else {
            console.warn(`[WARN] ${msg}`, data)
        }
    },

    error: (msg, error = {}, context = {}) => {
        const errorData = {
            message: error.message || msg,
            stack: error.stack,
            ...context,
            timestamp: new Date().toISOString(),
            url: !isServer ? window.location.href : 'server'
        }

        if (isServer) {
            console.error(`[ERROR] ${msg}`, JSON.stringify(errorData))
        } else {
            console.error(`[ERROR] ${msg}`, errorData)
            // Send to telemetry endpoint if on client
            fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'client_error', ...errorData })
            }).catch(err => console.warn('Failed to send telemetry', err))
        }
    },

    critical: (msg, data = {}) => {
        const criticalData = {
            ...data,
            severity: 'CRITICAL',
            timestamp: new Date().toISOString()
        }
        if (isServer) {
            console.error(`[CRITICAL] ${msg}`, JSON.stringify(criticalData))
            // In a real production system, this might trigger a PagerDuty/Slack alert
        } else {
            console.error(`[CRITICAL] ${msg}`, criticalData)
            fetch('/api/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'critical_violation', ...criticalData })
            }).catch(err => console.warn('Failed to send critical telemetry', err))
        }
    }
}

export default logger
