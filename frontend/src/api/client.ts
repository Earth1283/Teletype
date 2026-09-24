import axios from 'axios'

export const TOKEN_KEY = 'teletype-jwt'

export const api = axios.create({ baseURL: '/api' })

export function expireSession() {
  localStorage.removeItem(TOKEN_KEY)
  window.location.reload()
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) expireSession()
    return Promise.reject(err)
  }
)

export function apiError(e: unknown, fallback: string): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { error?: unknown } | undefined
    if (typeof data?.error === 'string') return data.error
  }
  return fallback
}

export function apiStatus(e: unknown): number | undefined {
  return axios.isAxiosError(e) ? e.response?.status : undefined
}

export async function downloadViaToken(tokenEndpoint: string, params?: Record<string, string>) {
  const { data } = await api.post<{ url: string }>(tokenEndpoint, null, { params })
  const link = document.createElement('a')
  link.href = data.url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}
