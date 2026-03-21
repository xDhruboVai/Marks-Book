const API_BASE_URL = (
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_API_BASE_URL ||
  'http://localhost:8001'
).replace(/\/+$/, '');
const TERMS_BASE_URL = `${API_BASE_URL}/marks/terms`;
const SEMESTERS_BASE_URL = `${API_BASE_URL}/marks/semesters`;
const CURRENT_COURSES_BASE_URL = `${API_BASE_URL}/marks/courses/current`;
const COURSE_IMPORT_BASE_URL = `${API_BASE_URL}/marks/courses/import`;

async function parseResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message = body?.error?.message || `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body.data;
}

export async function fetchTerms(userId) {
  const response = await fetch(`${TERMS_BASE_URL}/${userId}`);
  return parseResponse(response);
}

export async function fetchSemesters(userId) {
  const response = await fetch(`${SEMESTERS_BASE_URL}/${userId}`);
  return parseResponse(response);
}

export async function fetchCurrentSemesterCourses(userId) {
  const response = await fetch(`${CURRENT_COURSES_BASE_URL}/${userId}`);
  return parseResponse(response);
}

export async function importCurrentSemesterCourses(payload) {
  const response = await fetch(COURSE_IMPORT_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function createTerm(payload) {
  const response = await fetch(TERMS_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function updateTerm(termId, payload) {
  const response = await fetch(`${TERMS_BASE_URL}/${termId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function deleteTerm(termId) {
  const response = await fetch(`${TERMS_BASE_URL}/${termId}`, {
    method: 'DELETE',
  });

  return parseResponse(response);
}
