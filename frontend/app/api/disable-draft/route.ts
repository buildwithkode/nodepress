import { draftMode, cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const destination = searchParams.get('redirect') || '/';

  // Disable Next.js Draft Mode
  const draft = await draftMode();
  draft.disable();

  // Clear preview token cookie
  const cookieStore = await cookies();
  cookieStore.delete('nodepress_preview_token');

  redirect(destination);
}
