'use client'
import { useAppStore } from '@/store/useAppStore'

export default function SettingsPage() {
  const { user, setUser } = useAppStore()

  async function toggleTheme() {
    const newTheme = user?.theme === 'dark' ? 'light' : 'dark'
    await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: newTheme }),
    })
    if (user) setUser({ ...user, theme: newTheme })
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
    </div>
  )
}
