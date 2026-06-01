export async function apiFetch(
  url: string,
  options: RequestInit = {},
  apiKey?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (apiKey) headers['x-cursor-api-key'] = apiKey;

  return fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });
}
