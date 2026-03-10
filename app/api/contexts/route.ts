import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const contexts = await prisma.context.findMany({
    where: { userId: auth.userId },
    include: { channels: true },
  })
  return NextResponse.json(contexts)
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await req.json()
  const context = await prisma.context.create({
    data: { ...data, userId: auth.userId },
    include: { channels: true },
  })
  return NextResponse.json(context)
}
