'use client'
import { useState } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { RefreshCw, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const { user, setUser } = useAppStore()
  const [icalUrl, setIcalUrl] = useState('')
  const [icalSyncing, setIcalSyncing] = useState(false)
  const [icalMsg, setIcalMsg] = useState<string | null>(null)
  const [icalDisconnecting, setIcalDisconnecting] = useState(false)

  async function toggleTheme() {
    const newTheme = user?.theme === 'dark' ? 'light' : 'dark'
    await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    })
    if (user) setUser({ ...user, theme: newTheme })
  }

  async function handleIcalSync() {
    if (!icalUrl.trim() && !user?.icalConnected) return
    setIcalSyncing(true)
    setIcalMsg(null)
    const res = await fetch('/api/calendars/ical/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(icalUrl.trim() ? { url: icalUrl.trim() } : {}),
    })
    let data: Record<string, unknown> = {}
    try { data = await res.json() } catch { /* empty body */ }
    setIcalSyncing(false)
    if (res.ok) {
      setIcalMsg(`Synced ${data.synced as number} events`)
      setIcalUrl('')
      const me = await fetch('/api/auth/me').then(r => r.json())
      setUser(me)
    } else {
      setIcalMsg((data.error as string) || `Error ${res.status}`)
    }
  }

  async function handleIcalDisconnect() {
    setIcalDisconnecting(true)
    await fetch('/api/calendars/ical/disconnect', { method: 'POST' })
    setIcalDisconnecting(false)
    setIcalMsg(null)
    const me = await fetch('/api/auth/me').then(r => r.json())
    setUser(me)
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-2xl">
      <h1 className="text-xl font-semibold mb-6 text-stone-900 dark:text-stone-100">Settings</h1>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">Appearance</h2>
        <div className="flex items-center justify-between py-3 border-b border-stone-100 dark:border-stone-800">
          <div>
            <p className="text-sm font-medium text-stone-800 dark:text-stone-200">Theme</p>
            <p className="text-xs text-stone-500 mt-0.5">Choose light or dark mode</p>
          </div>
          <button
            onClick={toggleTheme}
            className="text-sm px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
          >
            {user?.theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
          </button>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">Integrations</h2>

        {/* iCal / ICS URL */}
        <div className="py-3 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center flex-shrink-0">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
                  <rect x="3" y="4" width="18" height="17" rx="2" stroke="#0f9d58" strokeWidth="1.5" />
                  <path d="M3 9h18" stroke="#0f9d58" strokeWidth="1.5" />
                  <path d="M8 2v4M16 2v4" stroke="#0f9d58" strokeWidth="1.5" strokeLinecap="round" />
                  <text x="12" y="19" textAnchor="middle" fill="#0f9d58" fontSize="6" fontWeight="bold">iCal</text>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-stone-800 dark:text-stone-200">iCal / ICS Feed</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {user?.icalConnected ? (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <CheckCircle2 size={11} /> Connected
                    </span>
                  ) : (
                    'Works with Google, Apple, Outlook calendars'
                  )}
                </p>
              </div>
            </div>
            {user?.icalConnected && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleIcalSync}
                  disabled={icalSyncing}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={11} className={icalSyncing ? 'animate-spin' : ''} />
                  {icalSyncing ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  onClick={handleIcalDisconnect}
                  disabled={icalDisconnecting}
                  className="text-xs px-3 py-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {!user?.icalConnected && (
            <div className="mt-3 ml-11 flex gap-2">
              <input
                type="url"
                value={icalUrl}
                onChange={e => setIcalUrl(e.target.value)}
                placeholder="Paste your iCal URL (webcal:// or https://)"
                className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleIcalSync}
                disabled={icalSyncing || !icalUrl.trim()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {icalSyncing ? <RefreshCw size={11} className="animate-spin" /> : null}
                {icalSyncing ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          )}

          {icalMsg && (
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-2 ml-11">{icalMsg}</p>
          )}

          {!user?.icalConnected && (
            <p className="text-xs text-stone-400 mt-2 ml-11">
              In Google Calendar: click ⋮ next to your calendar → Settings → "Secret address in iCal format"
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
