'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { apiFetch, swrFetcher } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, CheckSquare, Clock, AlertTriangle, TrendingUp } from 'lucide-react'
import { statusColors } from '@/lib/constants'

export default function DashboardPage() {
  const { data: stats, error } = useSWR('/api/stats', swrFetcher)

  if (!stats && !error) return (
    <div className="p-8 flex items-center justify-center">
      <div className="text-gray-400">Loading dashboard...</div>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of all clients and tasks</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Clients</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.totalClients || 0}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">In Progress</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{stats?.inProgress || 0}</p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                <CheckSquare className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Approval</p>
                <p className="text-3xl font-bold text-amber-600 mt-1">{stats?.toBeApproved || 0}</p>
              </div>
              <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border border-gray-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Blocked</p>
                <p className="text-3xl font-bold text-red-600 mt-1">{stats?.blocked || 0}</p>
              </div>
              <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="border border-gray-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-50">
            {(stats?.recentActivity || []).slice(0, 15).map((task) => (
              <div key={task.id} className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status] || 'bg-gray-100 text-gray-700'
                  }`}>{task.status}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                  <p className="text-xs text-gray-400">{task.client_name}</p>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">
                  {task.category}
                </div>
              </div>
            ))}
            {(!stats?.recentActivity || stats.recentActivity.length === 0) && (
              <div className="px-6 py-8 text-center text-gray-400 text-sm">No activity yet</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
