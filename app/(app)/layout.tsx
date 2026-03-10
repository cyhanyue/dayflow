import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthUser()
  if (!auth) redirect('/login')
  return <AppShell>{children}</AppShell>
}
