import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="notice">
      <h1>Not found</h1>
      <p>
        <Link href="/">Back to all posts</Link>
      </p>
    </div>
  );
}
