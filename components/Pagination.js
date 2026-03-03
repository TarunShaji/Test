'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({ total, page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null

    const limit = 50
    const start = (page - 1) * limit + 1
    const end = Math.min(page * limit, total)

    return (
        <div className="flex items-center justify-between px-2 py-4 border-t border-gray-100 bg-white rounded-b-lg">
            <div className="text-xs text-gray-500">
                Showing <span className="font-medium text-gray-900">{start}–{end}</span> of <span className="font-medium text-gray-900">{total}</span>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    className="h-8 px-2"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Previous
                </Button>

                <div className="flex items-center gap-1 mx-2">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNum = i + 1
                        // Simple sliding window for page numbers
                        if (totalPages > 5 && page > 3) {
                            pageNum = page - 3 + i + 1
                            if (pageNum > totalPages) pageNum = totalPages - (4 - i)
                        }

                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                className={`h-8 w-8 text-xs rounded border transition-colors ${page === pageNum
                                        ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
                                        : 'text-gray-500 border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {pageNum}
                            </button>
                        )
                    })}
                    {totalPages > 5 && page + 2 < totalPages && <span className="text-gray-400">...</span>}
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    className="h-8 px-2"
                >
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
            </div>
        </div>
    )
}
