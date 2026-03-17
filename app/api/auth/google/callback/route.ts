import { NextRequest, NextResponse } from 'next/server'

// Google Calendar OAuth is disabled. Use iCal / ICS feed instead.
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/settings?google=disabled', req.url))
}
