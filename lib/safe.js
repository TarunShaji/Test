/**
 * Safe Utility Layer
 * Exclusive host for "explosive" runtime operations.
 * NO direct 'new URL()' or 'JSON.parse()' allowed outside this file.
 */

import logger from './logger'

export function safeURL(input, fallback = null) {
    if (!input) return fallback
    try {
        return new URL(input)
    } catch (err) {
        logger.warn('INVALID_URL_SUPPRESSED', { input })
        return fallback
    }
}

export function safeJSON(input, fallback = null) {
    if (typeof input !== 'string') return fallback
    try {
        return JSON.parse(input)
    } catch (err) {
        logger.warn('INVALID_JSON_SUPPRESSED', { inputSnippet: input.slice(0, 50) })
        return fallback
    }
}

export function safeDate(input, fallback = null) {
    if (!input) return fallback
    const date = new Date(input)
    if (isNaN(date.getTime())) {
        logger.warn('INVALID_DATE_SUPPRESSED', { input })
        return fallback
    }
    return date
}

/**
 * Ensures input is always an array.
 */
export function safeArray(input) {
    return Array.isArray(input) ? input : []
}

/**
 * Coerces unknown input to a safe string.
 */
export function safeString(input, fallback = '') {
    if (typeof input === 'string') return input
    if (input === null || input === undefined) return fallback
    try {
        return String(input)
    } catch {
        return fallback
    }
}
