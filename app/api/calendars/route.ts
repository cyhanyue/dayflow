import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const calendars = await prisma.calendar.findMany({ where: { userId: auth.userId } })
    return NextResponse.json(calendars)
  } catch (err) {
    console.error('GET /api/calendars error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { name, color, isVisible, isDefault } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    const calendar = await prisma.calendar.create({
      data: {
        userId: auth.userId,
        name: name.trim(),
        color: color ?? '#3b82f6',
        isVisible: isVisible ?? true,
        isDefault: isDefault ?? false,
      },
    })
    return NextResponse.json(calendar)
  } catch (err) {
    console.error('POST /api/calendars error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
