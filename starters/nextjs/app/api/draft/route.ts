import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { NodePressError } from '@nodepress/client';
import { getPreview, PREVIEW_LOCALE_COOKIE, PREVIEW_TOKEN_COOKIE } from '@/lib/cms';

/**
 * Entry point for previews: set the content type's Preview URL in NodePress to
 *   http://localhost:3002/api/draft?token={token}&slug={slug}&locale={locale}
 * The token is checked against NodePress before draft mode is turned on.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get('token');
  const slug = params.get('slug');
  const locale = params.get('locale') || undefined;
  if (!token || !slug) return new Response('Missing token or slug', { status: 400 });

  try {
    await getPreview(slug, token, locale);
  } catch (err) {
    const status = err instanceof NodePressError && err.status === 404 ? 404 : 401;
    return new Response(status === 404 ? 'Entry not found' : 'Invalid or expired preview token', { status });
  }

  (await draftMode()).enable();
  // The editor shows this site in an iframe, which is a third-party context
  // in production: cookies need SameSite=None; Secure there.
  const production = process.env.NODE_ENV === 'production';
  const jar = await cookies();
  const options = {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60, // preview tokens last an hour
    sameSite: production ? ('none' as const) : ('lax' as const),
    secure: production,
  };
  jar.set(PREVIEW_TOKEN_COOKIE, token, options);
  if (locale) jar.set(PREVIEW_LOCALE_COOKIE, locale, options);
  else jar.delete(PREVIEW_LOCALE_COOKIE);

  // Only ever redirect to a path on this site.
  redirect(`/posts/${encodeURIComponent(slug)}`);
}
