const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:4000';

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body?.error?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body.data;
}

export async function fetchTerms(userId) {
  const response = await fetch(`${API_BASE_URL}/marks/terms/${userId}`);
  return parseResponse(response);
}

export async function createTerm(payload) {
  const response = await fetch(`${API_BASE_URL}/marks/terms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}
