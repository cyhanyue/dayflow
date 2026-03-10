import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const channels = await prisma.channel.findMany({
    where: { userId: auth.userId },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(channels)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const channel = await prisma.channel.create({
    data: { ...data, userId: auth.userId },
  })
  return NextResponse.json(channel)
}
