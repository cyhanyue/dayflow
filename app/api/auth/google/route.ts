import { NextResponse } from 'next/server'

// Google Calendar OAuth is disabled. Use iCal / ICS feed instead.
export async function GET() {
  return NextResponse.json({ error: 'Google Calendar integration is disabled' }, { status: 410 })
}
