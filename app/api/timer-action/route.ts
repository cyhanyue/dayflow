import { NextResponse } from 'next/server'

// Single pending action slot — FloatingTimer polls this and executes it
let pendingAction: string | null = null

export async function GET() {
  const action = pendingAction
  pendingAction = null // consume it
  return NextResponse.json({ action })
}

export async function POST(request: Request) {
  const { action } = await request.json()
  pendingAction = action
  return NextResponse.json({ ok: true })
}
