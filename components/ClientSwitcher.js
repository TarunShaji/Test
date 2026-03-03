'use client'

import { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

export function ClientSwitcher({ clients, activeId, onSelect }) {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredClients = useMemo(() => {
        if (!searchTerm.trim()) return clients
        const q = searchTerm.toLowerCase().trim()
        return clients.filter(c => c?.name?.toLowerCase().includes(q))
    }, [clients, searchTerm])

    return (
        <div className="flex flex-col gap-3 mb-6">
            <div className="flex items-center gap-4">
                {/* Searchable input - Leftmost filter */}
                <div className="relative w-72 flex-shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <Input
                        type="text"
                        placeholder="Search clients..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-10 border-gray-200 bg-white"
                    />
                </div>

                {/* Horizontal scrollable tab bars */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar mask-fade-right flex-grow">
                    <button
                        onClick={() => onSelect('all')}
                        className={`flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-full transition-all border ${activeId === 'all' || !activeId
                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        All Clients
                    </button>

                    {filteredClients.map((client) => (
                        <button
                            key={client.id}
                            onClick={() => onSelect(client.id)}
                            className={`flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-full transition-all border ${activeId === client.id
                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            {client.name}
                        </button>
                    ))}

                    {filteredClients.length === 0 && searchTerm && (
                        <span className="text-xs text-gray-400 italic py-1.5">No matching clients</span>
                    )}
                </div>
            </div>

            <style jsx>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .mask-fade-right {
           -webkit-mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
           mask-image: linear-gradient(to right, black calc(100% - 40px), transparent 100%);
        }
      `}</style>
        </div>
    )
}
