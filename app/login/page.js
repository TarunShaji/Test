'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LayoutDashboard, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const endpoint = isSignUp ? '/api/auth/register' : '/api/auth/login'
      const payload = isSignUp ? { email, password, name } : { email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || (isSignUp ? 'Registration failed' : 'Login failed'))
        return
      }

      if (isSignUp) {
        // After successful registration, switch to login or auto-login
        // Let's auto-login for better UX if the register returns a token, 
        // but our register API doesn't currently return a token.
        // So we'll switch to login mode and show a success message.
        setIsSignUp(false)
        setError('')
        alert('Registration successful! Please sign in with your new credentials.')
      } else {
        localStorage.setItem('agency_token', data.token)
        localStorage.setItem('agency_user', JSON.stringify(data.user))
        router.push('/dashboard')
      }
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg shadow-blue-500/20">
            <LayoutDashboard className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CubeHQ Dashboard</h1>
          <p className="text-slate-400 mt-2">Professional Agency Management Solution</p>
        </div>
        <Card className="border-0 shadow-2xl bg-slate-800/50 backdrop-blur-xl border-slate-700/50">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-white">
              {isSignUp ? 'Create Account' : 'Welcome back'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {isSignUp ? 'Join the agency team' : 'Enter your credentials to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-300">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Sarah Chen"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600"
                />
              </div>
              {/* role selector removed for simplification */}
              <div className="space-y-2">
                <Label htmlFor="password" title="password" className="text-slate-300">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-600"
                />
              </div>
              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6" disabled={loading}>
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : (isSignUp ? 'Sign Up' : 'Sign In')}
              </Button>
            </form>
            <div className="mt-6 flex flex-col items-center gap-4">
              <button
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                className="text-sm text-slate-400 hover:text-blue-400 transition-colors"
                disabled={loading}
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>

              {!isSignUp && (
                <div className="text-[10px] text-slate-500 text-center uppercase tracking-widest leading-relaxed">
                  Default: admin@agency.com / admin123
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
