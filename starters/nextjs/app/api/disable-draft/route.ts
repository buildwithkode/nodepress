import { cookies, draftMode } from 'next/headers';
import { redirect } from 'next/navigation';
import { PREVIEW_LOCALE_COOKIE, PREVIEW_TOKEN_COOKIE } from '@/lib/cms';

export async function GET() {
  (await draftMode()).disable();
  const jar = await cookies();
  jar.delete(PREVIEW_TOKEN_COOKIE);
  jar.delete(PREVIEW_LOCALE_COOKIE);
  redirect('/');
}
