import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const channels = await prisma.channel.findMany({
      where: { userId: auth.userId },
      orderBy: { sortOrder: 'asc' },
    })
    return NextResponse.json(channels)
  } catch (err) {
    console.error('GET /api/channels error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { name, color, icon, contextId, isDefault, sortOrder } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const channel = await prisma.channel.create({
      data: {
        userId: auth.userId,
        name: name.trim(),
        color: color ?? '#6366f1',
        icon: icon ?? null,
        contextId: contextId ?? null,
        isDefault: isDefault ?? false,
        sortOrder: sortOrder ?? 0,
      },
    })
    return NextResponse.json(channel)
  } catch (err) {
    console.error('POST /api/channels error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
