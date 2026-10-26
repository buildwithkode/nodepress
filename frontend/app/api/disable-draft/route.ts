import { draftMode, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { isLocalPath } from '@/lib/local-path';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requested = searchParams.get('redirect');
  const destination = requested && isLocalPath(requested) ? requested : '/';

  // Disable Next.js Draft Mode
  const draft = await draftMode();
  draft.disable();

  // Clear preview token cookie
  const cookieStore = await cookies();
  cookieStore.delete('nodepress_preview_token');

  redirect(destination);
}
