const KEY = 'djkado.apple.devToken';

/** Fetch (and cache) the MusicKit developer token from our server. Returns null when the server is not configured. */
export async function getDeveloperToken(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(KEY);
    if (cached) {
      const { token, expiresAt } = JSON.parse(cached);
      if (Date.now() < expiresAt - 86_400_000) return token;
    }
    const res = await fetch('/api/apple/developer-token');
    if (!res.ok) return null;
    const j = await res.json();
    localStorage.setItem(KEY, JSON.stringify(j));
    return j.token as string;
  } catch {
    return null;
  }
}
