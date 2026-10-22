// Compiled with `tsc --noEmit` by the tests: the generated types must fit the client.
import { createClient } from '../src/index';

interface BaseEntry<TData = Record<string, any>> {
  id: string; slug: string; locale: string; status: 'draft' | 'published' | 'archived';
  createdAt: string; updatedAt: string; seo?: { title?: string }; data: TData;
}
interface BlogPostData { title: string; views?: number; author?: string }
interface NodePressContentTypes { blog_post: BaseEntry<BlogPostData>; page: BaseEntry<{ body?: string }> }

async function check() {
  const cms = createClient<NodePressContentTypes>({ url: 'http://x' });
  const posts = await cms.collection('blog_post').list({ where: { views: { gte: 10 }, author: { slug: { eq: 'jane' } } }, sort: 'slug:asc' });
  const title: string = posts.data[0].data.title;
  // @ts-expect-error — not a content type
  cms.collection('nope');
  // @ts-expect-error — not a field of blog_post
  await cms.collection('blog_post').list({ where: { nope: 1 } });
  const loose = createClient({ url: 'http://x' });
  await loose.collection('anything').get('slug');
  return title;
}
void check;
