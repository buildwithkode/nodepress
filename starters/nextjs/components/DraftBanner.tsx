/** Shown while draft mode is on. */
export function DraftBanner() {
  return (
    <div className="draft-banner">
      Draft preview — you are seeing unpublished content.{' '}
      <a href="/api/disable-draft">Exit preview</a>
    </div>
  );
}
