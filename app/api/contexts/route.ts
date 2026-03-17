import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const contexts = await prisma.context.findMany({
      where: { userId: auth.userId },
      include: { channels: true },
    })
    return NextResponse.json(contexts)
  } catch (err) {
    console.error('GET /api/contexts error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { name, type } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const context = await prisma.context.create({
      data: {
        userId: auth.userId,
        name: name.trim(),
        type: type ?? 'work',
      },
      include: { channels: true },
    })
    return NextResponse.json(context)
  } catch (err) {
    console.error('POST /api/contexts error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
