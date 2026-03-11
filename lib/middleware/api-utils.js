import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import logger from '../logger'
import crypto from 'crypto'

export function apiLog(request) {
    const pathname = request.nextUrl.pathname
    const method = request.method
    console.log(`[BACKEND] [API_REQ] [${method}] ${pathname} - Started at ${new Date().toISOString()}`)
}

const JWT_SECRET = process.env.JWT_SECRET
let hasWarnedCorsFallback = false

// In-memory bucket for simple rate limiting (Internal tool context)
const RATE_LIMIT_STORE = new Map()

export function rateLimit(request, { limit = 10, windowMs = 60000 } = {}) {
    const ip = request.headers.get('x-forwarded-for') || 'anonymous'
    const now = Date.now()
    const record = RATE_LIMIT_STORE.get(ip) || { count: 0, reset: now + windowMs }

    if (now > record.reset) {
        record.count = 1
        record.reset = now + windowMs
    } else {
        record.count++
    }

    RATE_LIMIT_STORE.set(ip, record)

    if (record.count > limit) {
        return {
            blocked: true,
            response: handleCORS(NextResponse.json({ error: 'Too many requests' }, { status: 429 }), request)
        }
    }

    return { blocked: false }
}

function getAllowedOrigins() {
    const raw = (process.env.CORS_ORIGINS || process.env.NEXT_PUBLIC_BASE_URL || '').trim()
    if (!raw || raw === '*') return []
    return raw.split(',').map((v) => v.trim()).filter(Boolean)
}

function resolveAllowedOrigin(request, allowedOrigins) {
    if (allowedOrigins.length === 0) return '*'
    const requestOrigin = request?.headers?.get?.('origin')
    if (!requestOrigin) return allowedOrigins[0]
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : null
}

export function handleCORS(response, request = null) {
    const allowedOrigins = getAllowedOrigins()
    const allowedOrigin = resolveAllowedOrigin(request, allowedOrigins)

    if (allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', allowedOrigin)
    }
    if (allowedOrigins.length > 0) {
        response.headers.set('Access-Control-Allow-Credentials', 'true')
        response.headers.set('Vary', 'Origin')
    } else if (!hasWarnedCorsFallback) {
        hasWarnedCorsFallback = true
        logger.warn('CORS_ORIGINS not configured; falling back to wildcard CORS')
    }

    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Portal-Password')
    return response
}

export function verifyToken(request) {
    if (!JWT_SECRET) {
        logger.critical('JWT_SECRET environment variable is missing')
        throw new Error('JWT_SECRET environment variable is required')
    }

    // 1. Try Cookie (Production Standard)
    const tokenCookie = request.cookies.get('token')?.value

    // 2. Try Authorization Header (Fallback for scripts/tests)
    const authHeader = request.headers.get('Authorization')
    const tokenHeader = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

    // For production, we strictly require the httpOnly cookie to mitigate XSS.
    // We only allow the Authorization header in development or for internal scripts.
    const isProd = process.env.NODE_ENV === 'production'
    const token = tokenCookie || (!isProd ? tokenHeader : null)

    if (!token) return null

    try {
        return jwt.verify(token, JWT_SECRET)
    } catch (error) {
        logger.warn('Token verification failed', { error: error.message })
        return null
    }
}

export async function withErrorLogging(request, handler) {
    apiLog(request)
    const start = Date.now()
    try {
        const response = await handler()
        if (response instanceof NextResponse) {
            response.headers.set('X-Request-Start', start.toString())
        }
        return response
    } catch (error) {
        const path = request.nextUrl.pathname
        const method = request.method

        // Log the error with context
        logger.error(`API Error: ${method} ${path}`, error, {
            path,
            method
        })

        return handleCORS(NextResponse.json({
            error: 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        }, { status: 500 }), request)
    }
}

export async function withAuth(request, handler) {
    const user = verifyToken(request)
    if (!user) {
        logger.warn(`Unauthorized access attempt to ${request.nextUrl.pathname}`)
        return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), request)
    }
    return withErrorLogging(request, () => handler(user))
}
