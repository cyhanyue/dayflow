import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const calendars = await prisma.calendar.findMany({ where: { userId: auth.userId } })
  return NextResponse.json(calendars)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const calendar = await prisma.calendar.create({
    data: { ...data, userId: auth.userId },
  })
  return NextResponse.json(calendar)
}
