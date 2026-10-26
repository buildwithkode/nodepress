// GitHub details shown in the header and the right column.

export const REPO = 'buildwithkode/nodepress';
export const REPO_URL = `https://github.com/${REPO}`;

let stars: Promise<string | null> | undefined;

// Below this the count is left out — a low number reads as "abandoned".
const MIN_STARS_SHOWN = 100;

/** The repo's star count, e.g. "1.2k" — fetched once per build; null when GitHub can't be reached or it's below MIN_STARS_SHOWN. */
export function repoStars(): Promise<string | null> {
  stars ??= fetch(`https://api.github.com/repos/${REPO}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((repo) => (typeof repo?.stargazers_count === 'number' && repo.stargazers_count >= MIN_STARS_SHOWN ? formatCount(repo.stargazers_count) : null))
    .catch(() => null);
  return stars;
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);
}
