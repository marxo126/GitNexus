import { NextResponse } from 'next/server';

export async function GET() {
  const links = await getLinks();
  // Fields intentionally overlap with DOM property names
  return NextResponse.json({ type: 'nav', href: '/home', target: '_blank', label: 'Home' });
}
