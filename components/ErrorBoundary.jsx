'use client'

import React from 'react'
import logger from '@/lib/logger'

/**
 * Global Error Boundary for Dashboard Resilience.
 * Prevents single component crashes from white-screening the entire app.
 */
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props)
        this.state = { hasError: false }
    }

    static getDerivedStateFromError(error) {
        return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
        // Log the error to our isomorphic logger (which sends to telemetry on client)
        logger.error('UI_RENDER_CRASH', error, {
            componentStack: errorInfo.componentStack,
            url: typeof window !== 'undefined' ? window.location.href : 'unknown'
        })
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-white flex items-center justify-center p-6">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-xl font-bold text-gray-900">Something went wrong</h1>
                            <p className="text-sm text-gray-500">
                                The dashboard encountered an unexpected error. Our team has been notified.
                            </p>
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all"
                        >
                            Reload Dashboard
                        </button>
                    </div>
                </div>
            )
        }

        return this.props.children
    }
}

export default ErrorBoundary
