const API_BASE_URL = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

const AUTH_BASE_URL = `${API_BASE_URL}/auth`;

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body?.error?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return body.data;
}

export async function createAccount(payload) {
  const response = await fetch(`${AUTH_BASE_URL}/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}