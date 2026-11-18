async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('invoice:unauthorized'));
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data;
}

function withBody(method) {
  return (path, body) => request(path, { method, body: JSON.stringify(body ?? {}) });
}

export const api = {
  get: (path) => request(path),
  post: withBody('POST'),
  put: withBody('PUT'),
  patch: withBody('PATCH'),
  delete: (path) => request(path, { method: 'DELETE' }),
};
