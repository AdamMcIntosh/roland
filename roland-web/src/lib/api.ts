export async function apiFetch(
  url: string,
  options: RequestInit = {},
  apiKey: string,
): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-cursor-api-key': apiKey,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}
