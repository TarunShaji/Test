import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import logger from './logger'
import crypto from 'crypto'

const JWT_SECRET = process.env.JWT_SECRET

export function handleCORS(response) {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
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
    try {
        return await handler()
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
        }, { status: 500 }))
    }
}

export async function withAuth(request, handler) {
    const user = verifyToken(request)
    if (!user) {
        logger.warn(`Unauthorized access attempt to ${request.nextUrl.pathname}`)
        return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return withErrorLogging(request, () => handler(user))
}
