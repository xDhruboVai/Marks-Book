import { useCallback, useMemo, useState } from 'react';

const STORAGE_KEY = 'mb_user_state';

function createId(prefix = 'tmp_term_') {
  return `${prefix}${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function getInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        userId: null,
        terms: [],
        courses: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      userId: parsed.userId || null,
      terms: Array.isArray(parsed.terms) ? parsed.terms : [],
      courses: Array.isArray(parsed.courses) ? parsed.courses : [],
    };
  } catch (_error) {
    return {
      userId: null,
      terms: [],
      courses: [],
    };
  }
}

export function useMarksStore() {
  const [state, setState] = useState(getInitialState);

  const persist = useCallback((next) => {
    setState(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const createLocalTerm = useCallback(
    (termName) => {
      const cleaned = termName.trim();
      if (!cleaned) {
        throw new Error('Term name is required');
      }

      const exists = state.terms.some(
        (term) => term.term_name.toLowerCase() === cleaned.toLowerCase()
      );
      if (exists) {
        throw new Error('Term already exists in guest mode');
      }

      const now = new Date().toISOString();
      const term = {
        id: createId(),
        user_id: null,
        term_name: cleaned,
        linked_semester_id: null,
        created_at: now,
        updated_at: now,
      };

      const next = {
        ...state,
        terms: [term, ...state.terms],
      };
      persist(next);
      return term;
    },
    [persist, state]
  );

  const updateLocalTerm = useCallback(
    (termId, termName) => {
      const cleaned = termName.trim();
      if (!cleaned) {
        throw new Error('Term name is required');
      }

      const termExists = state.terms.some((term) => String(term.id) === String(termId));
      if (!termExists) {
        throw new Error('Term not found in guest mode');
      }

      const duplicateExists = state.terms.some(
        (term) =>
          String(term.id) !== String(termId) &&
          term.term_name.toLowerCase() === cleaned.toLowerCase()
      );
      if (duplicateExists) {
        throw new Error('Term already exists in guest mode');
      }

      const now = new Date().toISOString();
      const nextTerms = state.terms.map((term) => {
        if (String(term.id) !== String(termId)) {
          return term;
        }

        return {
          ...term,
          term_name: cleaned,
          updated_at: now,
        };
      });

      const next = {
        ...state,
        terms: nextTerms,
      };
      persist(next);

      return nextTerms.find((term) => String(term.id) === String(termId));
    },
    [persist, state]
  );

  const deleteLocalTerm = useCallback(
    (termId) => {
      const termExists = state.terms.some((term) => String(term.id) === String(termId));
      if (!termExists) {
        throw new Error('Term not found in guest mode');
      }

      const next = {
        ...state,
        terms: state.terms.filter((term) => String(term.id) !== String(termId)),
        courses: state.courses.filter((course) => String(course.term_id) !== String(termId)),
      };
      persist(next);
    },
    [persist, state]
  );

  const createLocalCourse = useCallback(
    (termId, payload) => {
      const normalizedTermId = String(termId);
      const term = state.terms.find((item) => String(item.id) === normalizedTermId);
      if (!term) {
        throw new Error('Term not found in guest mode');
      }

      const cleanedCode = String(payload?.course_code || '').trim().toUpperCase();
      const cleanedTitle = String(payload?.title || '').trim();
      const creditValue = Number(payload?.credit);

      if (!cleanedCode) {
        throw new Error('Course code is required');
      }

      if (!cleanedTitle) {
        throw new Error('Course title is required');
      }

      if (!Number.isFinite(creditValue) || creditValue <= 0) {
        throw new Error('Credit must be a positive number');
      }

      const duplicateExists = state.courses.some(
        (course) =>
          String(course.term_id) === normalizedTermId &&
          String(course.course_code || '').toLowerCase() === cleanedCode.toLowerCase()
      );
      if (duplicateExists) {
        throw new Error('Course code already exists in this term');
      }

      const now = new Date().toISOString();
      const course = {
        id: createId('tmp_course_'),
        term_id: normalizedTermId,
        user_id: null,
        course_code: cleanedCode,
        title: cleanedTitle,
        credit: creditValue,
        created_at: now,
        updated_at: now,
      };

      const next = {
        ...state,
        courses: [course, ...state.courses],
      };
      persist(next);
      return course;
    },
    [persist, state]
  );

  const deleteLocalCourse = useCallback(
    (courseId) => {
      const normalizedCourseId = String(courseId);
      const courseExists = state.courses.some((course) => String(course.id) === normalizedCourseId);
      if (!courseExists) {
        throw new Error('Course not found in guest mode');
      }

      const next = {
        ...state,
        courses: state.courses.filter((course) => String(course.id) !== normalizedCourseId),
      };
      persist(next);
    },
    [persist, state]
  );

  const terms = useMemo(() => state.terms, [state.terms]);
  const courses = useMemo(() => state.courses, [state.courses]);

  return {
    storageKey: STORAGE_KEY,
    userId: state.userId,
    terms,
    courses,
    createLocalTerm,
    updateLocalTerm,
    deleteLocalTerm,
    createLocalCourse,
    deleteLocalCourse,
  };
}
