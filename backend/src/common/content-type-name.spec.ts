import { contentTypeName, contentTypePath, keyCoversType } from './content-type-name';

describe('content type names', () => {
  it('stores snake_case and serves hyphen URLs', () => {
    expect(contentTypeName(' About Us ')).toBe('about_us');
    expect(contentTypeName('about-us')).toBe('about_us');
    expect(contentTypeName('Blog_Posts')).toBe('blog_posts');
    expect(contentTypePath('blog_posts')).toBe('blog-posts');
  });

  it('matches API key scopes whatever form the URL uses', () => {
    expect(keyCoversType(['about_us'], 'about-us')).toBe(true);
    expect(keyCoversType(['about_us'], 'About_Us')).toBe(true);
    expect(keyCoversType(['blog'], 'about-us')).toBe(false);
    expect(keyCoversType(['*'], 'anything')).toBe(true);
  });
});
