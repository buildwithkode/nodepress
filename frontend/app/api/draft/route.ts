import { draftMode, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret') || searchParams.get('token');
  const slug = searchParams.get('slug');
  const type = searchParams.get('type') || 'blog';
  const customRedirect = searchParams.get('redirect');

  if (!secret || !slug) {
    return new NextResponse('Missing secret or slug parameter for draft mode', { status: 400 });
  }

  const backendUrl = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

  // Validate the preview token against NodePress backend
  try {
    const res = await fetch(
      `${backendUrl}/api/${type}/${encodeURIComponent(slug)}/preview?token=${secret}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return new NextResponse('Invalid or expired preview token', { status: 401 });
    }

    const entry = await res.json();
    if (!entry) {
      return new NextResponse('Entry not found for draft preview', { status: 404 });
    }
  } catch (err) {
    return new NextResponse(`Error validating preview with NodePress: ${(err as Error).message}`, {
      status: 500,
    });
  }

  // Enable Next.js Draft Mode
  const draft = await draftMode();
  draft.enable();

  // Store the signed token in a secure preview cookie so RSCs can query draft content
  const cookieStore = await cookies();
  cookieStore.set('nodepress_preview_token', secret, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 3600, // 1 hour
  });

  const destination = customRedirect || `/${type}/${slug}`;
  redirect(destination);
}
