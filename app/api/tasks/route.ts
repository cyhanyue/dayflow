import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const isBacklog = searchParams.get('backlog') === 'true'
  const status = searchParams.get('status')

  const where: Record<string, unknown> = { userId: auth.userId, parentTaskId: null }
  if (isBacklog) {
    where.isBacklog = true
    where.isArchived = false
  } else if (date) {
    where.scheduledDate = date
    where.isBacklog = false
    where.isArchived = false
  }
  if (status) where.status = status

  const tasks = await prisma.task.findMany({
    where,
    include: { channel: true, subtasks: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(tasks)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await req.json()
  const task = await prisma.task.create({
    data: { ...data, userId: auth.userId },
    include: { channel: true, subtasks: true },
  })
  return NextResponse.json(task)
}
