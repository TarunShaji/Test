export function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('agency_token')
}

export function getUser() {
  if (typeof window === 'undefined') return null
  try {
    const u = localStorage.getItem('agency_user')
    return u ? JSON.parse(u) : null
  } catch {
    return null
  }
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
    const duration = Date.now() - start


    if (!res.ok) {
      console.warn(`[FRONTEND] [API_ERR] [${method}] ${url} - Status: ${res.status}`, {
        options,
        status: res.status,
        statusText: res.statusText
      })
    }

    return res
  } catch (error) {
    const duration = Date.now() - start
    console.error(`[FRONTEND] [API_FAIL] [${method}] ${url} - ${error.message} (${duration}ms)`, error)
    throw error
  }
}

export async function swrFetcher(url) {
  try {
    const res = await apiFetch(url)
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}))
      const error = new Error(errorData.error || 'An error occurred while fetching the data.')
      error.info = errorData
      error.status = res.status
      throw error
    }
    return res.json()
  } catch (error) {
    console.error(`[FRONTEND] [SWR_ERR] ${url}`, error)
    throw error
  }
}
