'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { getUser, logout } from '@/lib/auth'
import { safeArray } from '@/lib/safe'
import {
  LayoutDashboard, Users, CheckSquare, BarChart3,
  Upload, Menu, X, LogOut, ChevronRight, UserCircle, FolderOpen, FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/tasks', label: 'All Tasks', icon: CheckSquare },
  { href: '/dashboard/content', label: 'Content Calendar', icon: FileText },
  { href: '/dashboard/team', label: 'Team', icon: UserCircle },
  { href: '/dashboard/reports', label: 'Reports', icon: BarChart3 },
  { href: '/dashboard/import', label: 'Import', icon: Upload },
]

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('agency_token')
    if (!token) {
      router.push('/login')
      return
    }
    setUser(getUser())
  }, [])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const isActive = (item) => {
    if (item.exact) return pathname === item.href
    return pathname.startsWith(item.href)
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'
        } bg-white border-r border-gray-200 flex flex-col transition-all duration-200 flex-shrink-0`}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            {sidebarOpen && (
              <span className="font-bold text-gray-900 truncate">CubeHQ</span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="ml-auto p-1.5 rounded-md hover:bg-gray-100 text-gray-400 flex-shrink-0"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {safeArray(navItems).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${isActive(item)
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive(item) ? 'text-blue-700' : 'text-gray-400'
                }`} />
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* User */}
        {user && (
          <div className="border-t border-gray-100 p-3">
            <div className={`flex items-center gap-2 ${sidebarOpen ? 'px-2' : 'justify-center'}`}>
              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-blue-700 font-semibold text-xs">{user?.name?.charAt(0)}</span>
              </div>
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-900 truncate">{user?.name}</div>
                  <div className="text-xs text-gray-400 truncate">{user?.role}</div>
                </div>
              )}
              {sidebarOpen && (
                <button onClick={handleLogout} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {!sidebarOpen && (
              <button onClick={handleLogout} className="mt-2 w-full flex justify-center p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
