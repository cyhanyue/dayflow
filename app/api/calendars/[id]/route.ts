import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const existing = await prisma.calendar.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { name, color, isVisible, isDefault } = await req.json()
    const cal = await prisma.calendar.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(color !== undefined && { color }),
        ...(isVisible !== undefined && { isVisible }),
        ...(isDefault !== undefined && { isDefault }),
      },
    })
    return NextResponse.json(cal)
  } catch (err) {
    console.error('PATCH /api/calendars/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await params
    const existing = await prisma.calendar.findFirst({ where: { id, userId: auth.userId } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.calendar.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('DELETE /api/calendars/[id] error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
