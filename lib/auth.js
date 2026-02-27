import { safeJSON } from './safe'

export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('agency_token')
}

export function getUser() {
  if (typeof window === 'undefined') return null
  const u = localStorage.getItem('agency_user')
  return safeJSON(u)
}

export function logout() {
  localStorage.removeItem('agency_token')
  localStorage.removeItem('agency_user')
}

export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch(url, options = {}) {
  const token = getToken()
  const start = Date.now()
  const method = options.method || 'GET'

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }

  try {
    const res = await fetch(url, { ...options, headers })

    if (res.status === 401) {
      logout()
      if (typeof window !== 'undefined') window.location.href = '/login'
      return res
    }

    if (!res.ok) {
      console.warn(`[FRONTEND] [API_ERR] [${method}] ${url} - Status: ${res.status}`)
    }

    return res
  } catch (error) {
    const duration = Date.now() - start
    console.error(`[FRONTEND] [API_FAIL] [${method}] ${url} - ${error.message} (${duration}ms)`, error)

    // Return a synthetic non-throwing response for network failure
    return {
      ok: false,
      status: 0,
      json: async () => null,
      text: async () => ''
    }
  }
}

export async function swrFetcher(url) {
  try {
    const res = await apiFetch(url)
    if (!res || !res.ok) return null
    return await res.json().catch(() => null)
  } catch (error) {
    console.warn(`[FRONTEND] [SWR_FAIL] ${url}`, error)
    return null
  }
}
