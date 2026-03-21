import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createAccount } from './api/authApi';
import {
  createTerm,
  deleteTerm,
  fetchCurrentSemesterCourses,
  fetchSemesters,
  fetchTerms,
  importCurrentSemesterCourses,
  updateTerm,
} from './api/marksApi';
import { hasSupabaseEnv, supabase, supabaseEnvMessage } from './api/supabaseClient';
import { PROGRAM_OPTIONS } from './constants/programs';
import { useMarksStore } from './hooks/useMarksStore';

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildProgramLabel(program) {
  return `${program.level} · ${program.title} (${program.code}) · ${program.credits}`;
}

function buildCourseSummaryText(course) {
  const parts = [course.course_code || 'Untitled'];
  if (course.title) {
    parts.push(course.title);
  }
  if (course.credit) {
    parts.push(`${course.credit} credit`);
  }

  return parts.join(' · ');
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function getTermSortRank(term) {
  const createdAt = Date.parse(term?.created_at || '');
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  return toPositiveNumber(term?.id);
}

function getSemesterSortRank(semester) {
  const termIndex = Number(semester?.term_index);
  if (Number.isFinite(termIndex)) {
    return termIndex;
  }

  return toPositiveNumber(semester?.id);
}

function mapAndMergeTerms(marksTerms, semesters) {
  const normalizedMarksTerms = (Array.isArray(marksTerms) ? marksTerms : []).map((term) => ({
    ...term,
    source_type: 'marks_terms',
    sort_rank: getTermSortRank(term),
  }));

  const existingNames = new Set(
    normalizedMarksTerms.map((term) => String(term.term_name || '').trim().toLowerCase())
  );

  const normalizedSemesters = (Array.isArray(semesters) ? semesters : [])
    .map((semester) => {
      const fallbackName = `Semester ${semester.id}`;
      const semesterName = String(semester.name || '').trim() || fallbackName;

      return {
        id: `semester_${semester.id}`,
        user_id: semester.user_id,
        term_name: semesterName,
        linked_semester_id: semester.id,
        created_at: null,
        updated_at: null,
        source_type: 'semesters',
        sort_rank: getSemesterSortRank(semester),
      };
    })
    .filter((term) => {
      const normalizedName = String(term.term_name || '').trim().toLowerCase();
      return normalizedName && !existingNames.has(normalizedName);
    });

  const merged = [...normalizedMarksTerms, ...normalizedSemesters];

  merged.sort((left, right) => {
    if (right.sort_rank !== left.sort_rank) {
      return right.sort_rank - left.sort_rank;
    }

    return String(right.term_name || '').localeCompare(String(left.term_name || ''));
  });

  return merged;
}

function DashboardPage({ session, onLogout }) {
  const navigate = useNavigate();

  const {
    terms: localTerms,
    createLocalTerm,
    updateLocalTerm,
    deleteLocalTerm,
  } = useMarksStore();
  const [termName, setTermName] = useState('');
  const [apiTerms, setApiTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingTermId, setEditingTermId] = useState(null);
  const [editingTermName, setEditingTermName] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentSemesterCourses, setCurrentSemesterCourses] = useState([]);
  const [importPromptDismissed, setImportPromptDismissed] = useState(false);
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [importTargetMode, setImportTargetMode] = useState('auto-create');
  const [importTargetTermId, setImportTargetTermId] = useState('');
  const [importNewTermName, setImportNewTermName] = useState('');
  const [selectedCurrentCourseIds, setSelectedCurrentCourseIds] = useState([]);
  const [importingCourses, setImportingCourses] = useState(false);

  const testUserId = (process.env.REACT_APP_TEST_USER_ID || '').trim();
  const activeUserId = session?.user?.id || testUserId;
  const mode = activeUserId ? 'api' : 'guest';
  const isAuthenticated = Boolean(session?.user);

  const terms = useMemo(() => {
    return mode === 'api' ? apiTerms : localTerms;
  }, [mode, apiTerms, localTerms]);

  const editableTerms = useMemo(() => {
    return terms.filter((term) => term.source_type !== 'semesters');
  }, [terms]);

  const showImportPrompt =
    isAuthenticated &&
    mode === 'api' &&
    currentSemesterCourses.length > 0 &&
    !importPromptDismissed;

  const latestTerm = terms.length ? terms[0] : null;
  const stats = useMemo(
    () => [
      {
        label: 'Total Terms',
        value: String(terms.length),
        tone: 'neutral',
      },
      {
        label: 'Latest Term',
        value: latestTerm ? latestTerm.term_name : 'Not set',
        tone: 'info',
      },
      {
        label: 'Storage',
        value: mode === 'api' ? 'Supabase API' : 'Guest Local',
        tone: 'accent',
        note:
          mode === 'api' && isAuthenticated
            ? `Signed in as ${session.user.email || 'your account'}. Progress is synced.`
            : mode === 'api'
            ? 'Using a configured API test user.'
            : 'Sign in with your GradeStack account to log in, or create an account. Your progress syncs automatically. Works for all departments.',
        showButton: mode !== 'api',
      },
    ],
    [isAuthenticated, latestTerm, mode, session?.user?.email, terms.length]
  );

  const refreshApiTerms = useCallback(async () => {
    if (!activeUserId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [marksTermsData, semestersData] = await Promise.all([
        fetchTerms(activeUserId),
        fetchSemesters(activeUserId),
      ]);
      setApiTerms(mapAndMergeTerms(marksTermsData, semestersData));
    } catch (err) {
      setError(err.message || 'Failed to load terms');
    } finally {
      setLoading(false);
    }
  }, [activeUserId]);

  const refreshCurrentSemesterCourses = useCallback(async () => {
    if (!session?.user?.id) {
      setCurrentSemesterCourses([]);
      return;
    }

    try {
      const data = await fetchCurrentSemesterCourses(session.user.id);
      setCurrentSemesterCourses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load GradeStack current semester courses');
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (mode === 'api') {
      refreshApiTerms();
      return;
    }
    setApiTerms([]);
  }, [mode, refreshApiTerms]);

  useEffect(() => {
    if (!isAuthenticated || mode !== 'api') {
      setCurrentSemesterCourses([]);
      setImportPanelOpen(false);
      setImportPromptDismissed(false);
      setSelectedCurrentCourseIds([]);
      return;
    }

    refreshCurrentSemesterCourses();
  }, [isAuthenticated, mode, refreshCurrentSemesterCourses]);

  useEffect(() => {
    const availableIds = new Set(currentSemesterCourses.map((course) => Number(course.id)));

    setSelectedCurrentCourseIds((previous) => {
      const kept = previous.filter((courseId) => availableIds.has(Number(courseId)));
      if (kept.length || !currentSemesterCourses.length) {
        return kept;
      }
      return currentSemesterCourses.map((course) => Number(course.id));
    });

    if (!currentSemesterCourses.length) {
      setImportPanelOpen(false);
      setImportPromptDismissed(false);
      setImportTargetTermId('');
    }
  }, [currentSemesterCourses]);

  const onGoToAuth = () => {
    navigate('/auth');
  };

  const onOpenTerm = (termId) => {
    navigate(`/dashboard/terms/${encodeURIComponent(String(termId))}`);
  };

  const onOpenImportPanel = () => {
    setImportPromptDismissed(false);
    setImportPanelOpen(true);
    if (!selectedCurrentCourseIds.length) {
      setSelectedCurrentCourseIds(currentSemesterCourses.map((course) => Number(course.id)));
    }
  };

  const onToggleImportCourse = (courseId) => {
    const normalizedId = Number(courseId);
    setSelectedCurrentCourseIds((previous) => {
      if (previous.includes(normalizedId)) {
        return previous.filter((id) => id !== normalizedId);
      }
      return [...previous, normalizedId];
    });
  };

  const onSelectAllImportCourses = () => {
    setSelectedCurrentCourseIds(currentSemesterCourses.map((course) => Number(course.id)));
  };

  const onClearImportSelection = () => {
    setSelectedCurrentCourseIds([]);
  };

  const onImportCourses = async () => {
    setError('');
    setSuccess('');

    if (!session?.user?.id) {
      setError('Please log in first to import courses from GradeStack.');
      return;
    }

    if (!selectedCurrentCourseIds.length) {
      setError('Select at least one course to import.');
      return;
    }

    if (importTargetMode === 'existing' && !importTargetTermId) {
      setError('Select a target term for import.');
      return;
    }

    setImportingCourses(true);

    try {
      const payload = {
        user_id: session.user.id,
        course_ids: selectedCurrentCourseIds,
        target_mode: importTargetMode,
      };

      if (importTargetMode === 'existing') {
        payload.target_term_id = Number(importTargetTermId);
      }

      if (importTargetMode === 'auto-create' && importNewTermName.trim()) {
        payload.new_term_name = importNewTermName.trim();
      }

      const result = await importCurrentSemesterCourses(payload);

      await Promise.all([refreshApiTerms(), refreshCurrentSemesterCourses()]);

      const summary = result?.summary || {};
      const importedCount = Number(summary.imported_count || 0);
      const skippedCount = Number(summary.skipped_count || 0);
      const failedCount = Number(summary.failed_count || 0);

      if (importedCount > 0) {
        setSuccess(
          `Imported ${importedCount} course(s) into ${result?.target_term?.term_name || 'target term'}${
            skippedCount ? `, skipped ${skippedCount}` : ''
          }${failedCount ? `, failed ${failedCount}` : ''}.`
        );
      } else {
        setSuccess(
          `No new courses were imported${skippedCount ? ` (skipped ${skippedCount})` : ''}${
            failedCount ? ` (failed ${failedCount})` : ''
          }.`
        );
      }

      setImportPanelOpen(false);
      setImportTargetTermId('');
      setImportNewTermName('');
    } catch (err) {
      setError(err.message || 'Could not import GradeStack courses');
    } finally {
      setImportingCourses(false);
    }
  };

  const onLogOut = async () => {
    setError('');
    setSuccess('');
    setLoggingOut(true);
    try {
      await onLogout();
      setSuccess('Logged out. You are now using guest local mode.');
      setCurrentSemesterCourses([]);
      setImportPanelOpen(false);
      setImportPromptDismissed(false);
      setSelectedCurrentCourseIds([]);
    } catch (err) {
      setError(err.message || 'Could not log out');
    } finally {
      setLoggingOut(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (mode === 'guest') {
        const term = createLocalTerm(termName);
        setSuccess(`Saved term "${term.term_name}" locally`);
      } else {
        await createTerm({
          user_id: activeUserId,
          term_name: termName.trim(),
          linked_semester_id: null,
        });
        await refreshApiTerms();
        setSuccess(`Saved term "${termName.trim()}" to API`);
      }
      setTermName('');
    } catch (err) {
      setError(err.message || 'Could not create term');
    }
  };

  const startEditing = (term) => {
    if (term?.source_type === 'semesters') {
      setError('Semester terms are read-only and cannot be edited here.');
      setSuccess('');
      return;
    }

    setError('');
    setSuccess('');
    setEditingTermId(String(term.id));
    setEditingTermName(term.term_name);
  };

  const cancelEditing = () => {
    setEditingTermId(null);
    setEditingTermName('');
  };

  const onSaveEdit = async (termId) => {
    setError('');
    setSuccess('');

    const term = terms.find((item) => String(item.id) === String(termId));
    if (term?.source_type === 'semesters') {
      setError('Semester terms are read-only and cannot be edited here.');
      return;
    }

    try {
      if (mode === 'guest') {
        const updated = updateLocalTerm(termId, editingTermName);
        setSuccess(`Updated term to "${updated.term_name}" locally`);
      } else {
        await updateTerm(termId, {
          term_name: editingTermName.trim(),
          linked_semester_id: null,
        });
        await refreshApiTerms();
        setSuccess(`Updated term to "${editingTermName.trim()}" in API`);
      }
      cancelEditing();
    } catch (err) {
      setError(err.message || 'Could not update term');
    }
  };

  const onDeleteTerm = async (termId) => {
    setError('');
    setSuccess('');

    const term = terms.find((item) => String(item.id) === String(termId));
    if (term?.source_type === 'semesters') {
      setError('Semester terms are imported from the database and cannot be deleted.');
      return;
    }

    const confirmed = window.confirm('Delete this term?');
    if (!confirmed) {
      return;
    }

    try {
      if (mode === 'guest') {
        deleteLocalTerm(termId);
        setSuccess('Deleted term locally');
      } else {
        await deleteTerm(termId);
        await refreshApiTerms();
        setSuccess('Deleted term from API');
      }

      if (String(editingTermId) === String(termId)) {
        cancelEditing();
      }
    } catch (err) {
      setError(err.message || 'Could not delete term');
    }
  };

  return (
    <main className="app-shell">
      <section className="hero reveal">
        <div className="hero-content">
          <p className="eyebrow">Marks Book Studio</p>
          <h1>Design your academic term with confidence.</h1>
          <p className="muted hero-copy">
            A focused workspace for planning semesters, tracking progress, and preparing for
            deeper course analytics.
          </p>
          <div className="hero-pills">
            <span className="pill tone-accent">Mode: {mode === 'api' ? 'API Sync' : 'Guest Local'}</span>
            {isAuthenticated ? (
              <button type="button" className="pill-button" onClick={onLogOut} disabled={loggingOut}>
                {loggingOut ? 'Logging out...' : 'Log Out'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="stats-grid">
          {stats.map((stat, index) => (
            <article key={stat.label} className={`stat-card stagger-${(index % 3) + 1} ${stat.tone}`}>
              <p className="stat-label">{stat.label}</p>
              <p className="stat-value">{stat.value}</p>
              {stat.note ? <p className="stat-note">{stat.note}</p> : null}
              {stat.showButton ? (
                <button type="button" className="stat-button" onClick={onGoToAuth}>
                  Sign Up / Log In
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-grid">
        <article className="panel reveal delay-1 create-panel">
          <div className="panel-head">
            <h2>Create Term</h2>
          </div>
          <p className="muted">Give your term a clear title, such as Fall 2026 or Summer Intensive.</p>

          <form onSubmit={onSubmit} className="create-form" aria-label="Create term form">
            <label htmlFor="term-name" className="field-label">
              Term Name
            </label>
            <div className="row">
              <input
                id="term-name"
                value={termName}
                onChange={(event) => setTermName(event.target.value)}
                placeholder="Fall 2026"
                maxLength={80}
              />
              <button type="submit" disabled={loading || !termName.trim()}>
                Save Term
              </button>
            </div>
          </form>

          {error ? <p className="feedback error">{error}</p> : null}
          {success ? <p className="feedback success">{success}</p> : null}
        </article>

        <article className="panel reveal delay-2 terms-panel">
          <div className="panel-head terms-head">
            <div>
              <h2>Term Library</h2>
              <p className="muted">Total terms: {terms.length}</p>
            </div>
            {mode === 'api' ? (
              <button type="button" className="secondary" onClick={refreshApiTerms} disabled={loading}>
                Refresh
              </button>
            ) : null}
          </div>

          {showImportPrompt ? (
            <div className="import-banner">
              <p className="import-banner-title">
                GradeStack Current Semester: {currentSemesterCourses.length} course(s) available to import
              </p>
              <p className="muted import-banner-copy">
                Import selected courses with full assessments and scores into a Marks term.
              </p>
              <div className="import-banner-actions">
                <button type="button" onClick={onOpenImportPanel}>
                  {importPanelOpen ? 'Edit Import Selection' : 'Start Import'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setImportPromptDismissed(true);
                    setImportPanelOpen(false);
                  }}
                >
                  Dismiss
                </button>
              </div>

              {importPanelOpen ? (
                <div className="import-panel">
                  <div className="import-panel-head">
                    <p className="import-panel-title">
                      Selected: {selectedCurrentCourseIds.length}/{currentSemesterCourses.length}
                    </p>
                    <div className="import-panel-inline-actions">
                      <button type="button" className="secondary" onClick={onSelectAllImportCourses}>
                        Select All
                      </button>
                      <button type="button" className="secondary" onClick={onClearImportSelection}>
                        Clear
                      </button>
                    </div>
                  </div>

                  <ul className="import-course-list">
                    {currentSemesterCourses.map((course) => {
                      const numericId = Number(course.id);
                      const checked = selectedCurrentCourseIds.includes(numericId);
                      return (
                        <li key={course.id} className="import-course-item">
                          <label className="import-course-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggleImportCourse(course.id)}
                            />
                            <span>{buildCourseSummaryText(course)}</span>
                          </label>
                          <span className="import-course-meta">
                            {course.assessments_count || 0} assessments, {course.scores_count || 0} scores
                          </span>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="import-target-box">
                    <p className="import-panel-title">Import Target</p>
                    <label className="import-radio-option">
                      <input
                        type="radio"
                        name="import-target-mode"
                        value="auto-create"
                        checked={importTargetMode === 'auto-create'}
                        onChange={() => setImportTargetMode('auto-create')}
                      />
                      Auto-create a new term (default)
                    </label>
                    <label className="import-radio-option">
                      <input
                        type="radio"
                        name="import-target-mode"
                        value="existing"
                        checked={importTargetMode === 'existing'}
                        onChange={() => setImportTargetMode('existing')}
                      />
                      Import into an existing term
                    </label>

                    {importTargetMode === 'auto-create' ? (
                      <>
                        <label htmlFor="import-new-term-name" className="field-label">
                          Optional New Term Name
                        </label>
                        <input
                          id="import-new-term-name"
                          placeholder="Leave empty to auto-name from latest semester"
                          value={importNewTermName}
                          onChange={(event) => setImportNewTermName(event.target.value)}
                          maxLength={80}
                        />
                      </>
                    ) : (
                      <>
                        <label htmlFor="import-target-term" className="field-label">
                          Existing Term
                        </label>
                        <select
                          id="import-target-term"
                          className="select-field"
                          value={importTargetTermId}
                          onChange={(event) => setImportTargetTermId(event.target.value)}
                        >
                          <option value="">Select a term</option>
                          {editableTerms.map((term) => (
                            <option key={term.id} value={term.id}>
                              {term.term_name}
                            </option>
                          ))}
                        </select>
                        {!editableTerms.length ? (
                          <p className="muted import-target-warning">
                            No editable terms available yet. Create one first or use auto-create.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div className="import-banner-actions">
                    <button type="button" onClick={onImportCourses} disabled={importingCourses}>
                      {importingCourses ? 'Importing...' : 'Import Selected Courses'}
                    </button>
                    <button type="button" className="secondary" onClick={() => setImportPanelOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {loading ? <p className="status-line">Loading terms...</p> : null}
          {!terms.length && !loading ? <p className="empty-state">No terms yet. Create your first one to get started.</p> : null}

          <ol className="term-list">
            {terms.map((term, index) => (
              <li key={term.id} className={`term-row stagger-${(index % 3) + 1}`}>
                <div className="term-main">
                  {String(editingTermId) === String(term.id) ? (
                    <input
                      value={editingTermName}
                      onChange={(event) => setEditingTermName(event.target.value)}
                      maxLength={80}
                    />
                  ) : (
                    <>
                      <button type="button" className="term-open-button" onClick={() => onOpenTerm(term.id)}>
                        <span className="term-name">{term.term_name}</span>
                      </button>
                      <p className="term-meta">
                        {term.source_type === 'semesters'
                          ? 'Imported from semesters table (read-only)'
                          : `Created ${formatDate(term.created_at)}`}
                      </p>
                    </>
                  )}
                </div>
                <div className="term-actions">
                  {String(editingTermId) === String(term.id) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onSaveEdit(term.id)}
                        disabled={loading || !editingTermName.trim()}
                      >
                        Save
                      </button>
                      <button type="button" className="secondary" onClick={cancelEditing} disabled={loading}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    term.source_type === 'semesters' ? (
                      <span className="term-readonly-pill">Read-only</span>
                    ) : (
                      <>
                        <button type="button" className="secondary" onClick={() => startEditing(term)} disabled={loading}>
                          Edit
                        </button>
                        <button type="button" className="secondary danger" onClick={() => onDeleteTerm(term.id)} disabled={loading}>
                          Delete
                        </button>
                      </>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}

function TermWorkspacePage({ session }) {
  const navigate = useNavigate();
  const { termId } = useParams();

  const {
    terms: localTerms,
    courses: localCourses,
    createLocalCourse,
    deleteLocalCourse,
  } = useMarksStore();

  const [apiTerms, setApiTerms] = useState([]);
  const [loadingTerm, setLoadingTerm] = useState(false);
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseCredit, setCourseCredit] = useState('3');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const testUserId = (process.env.REACT_APP_TEST_USER_ID || '').trim();
  const activeUserId = session?.user?.id || testUserId;
  const mode = activeUserId ? 'api' : 'guest';

  useEffect(() => {
    if (mode !== 'api' || !activeUserId) {
      setApiTerms([]);
      return;
    }

    let mounted = true;

    const loadTerms = async () => {
      setLoadingTerm(true);
      setError('');

      try {
        const [marksTermsData, semestersData] = await Promise.all([
          fetchTerms(activeUserId),
          fetchSemesters(activeUserId),
        ]);

        if (!mounted) {
          return;
        }
        setApiTerms(mapAndMergeTerms(marksTermsData, semestersData));
      } catch (err) {
        if (!mounted) {
          return;
        }
        setError(err.message || 'Failed to load term');
      } finally {
        if (mounted) {
          setLoadingTerm(false);
        }
      }
    };

    loadTerms();

    return () => {
      mounted = false;
    };
  }, [activeUserId, mode]);

  const terms = mode === 'api' ? apiTerms : localTerms;

  const selectedTerm = useMemo(() => {
    return terms.find((term) => String(term.id) === String(termId)) || null;
  }, [termId, terms]);

  const courses = useMemo(() => {
    if (mode !== 'guest') {
      return [];
    }

    return localCourses.filter((course) => String(course.term_id) === String(termId));
  }, [localCourses, mode, termId]);

  const onCreateCourse = (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (mode !== 'guest') {
      setError('Offline course creation is currently available only in guest mode.');
      return;
    }

    try {
      const created = createLocalCourse(termId, {
        course_code: courseCode,
        title: courseTitle,
        credit: Number(courseCredit),
      });

      setSuccess(`Course "${created.course_code}" added to ${selectedTerm?.term_name || 'term'}.`);
      setCourseCode('');
      setCourseTitle('');
      setCourseCredit('3');
    } catch (err) {
      setError(err.message || 'Could not create course');
    }
  };

  const onDeleteCourse = (courseId) => {
    setError('');
    setSuccess('');

    const confirmed = window.confirm('Delete this course?');
    if (!confirmed) {
      return;
    }

    try {
      deleteLocalCourse(courseId);
      setSuccess('Course removed from this term.');
    } catch (err) {
      setError(err.message || 'Could not delete course');
    }
  };

  return (
    <main className="app-shell">
      <section className="panel reveal workspace-detail">
        <div className="detail-header">
          <button type="button" className="secondary detail-back" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
          <p className="eyebrow">Term Workspace</p>
          <h1 className="detail-title">{selectedTerm ? selectedTerm.term_name : 'Term'}</h1>
          <p className="muted detail-copy">
            {mode === 'guest'
              ? 'Create and manage multiple courses for this term '
              : 'API term course management will be added next. Offline guest mode is ready now.'}
          </p>
        </div>

        {loadingTerm ? <p className="status-line">Loading term...</p> : null}

        {!loadingTerm && !selectedTerm ? (
          <div className="empty-state">
            Term not found. It may have been deleted or moved.
          </div>
        ) : null}

        {selectedTerm && mode === 'guest' ? (
          <>
            <div className="detail-meta-row">
              <span className="pill tone-accent">Courses: {courses.length}</span>
              <span className="pill">Created {formatDate(selectedTerm.created_at)}</span>
            </div>

            <div className="term-workspace-grid">
              <section className="workspace-column workspace-column-courses">
                <h2>Created Courses</h2>
                {!courses.length ? (
                  <p className="empty-state">No courses yet. Add your first course for this term.</p>
                ) : (
                  <ul className="course-list">
                    {courses.map((course) => (
                      <li key={course.id} className="course-row">
                        <div>
                          <p className="course-name">{course.course_code}</p>
                          <p className="term-meta">
                            {course.title} · {course.credit} credit
                          </p>
                        </div>
                        <button
                          type="button"
                          className="secondary danger"
                          onClick={() => onDeleteCourse(course.id)}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="workspace-column workspace-column-create">
                <form onSubmit={onCreateCourse} className="course-form" aria-label="Create course form">
                  <h2>Add Course</h2>

                  <label htmlFor="course-code" className="field-label">
                    Course Code
                  </label>
                  <input
                    id="course-code"
                    value={courseCode}
                    onChange={(event) => setCourseCode(event.target.value)}
                    placeholder="CSE220"
                    maxLength={24}
                    required
                  />

                  <label htmlFor="course-title" className="field-label">
                    Course Title
                  </label>
                  <input
                    id="course-title"
                    value={courseTitle}
                    onChange={(event) => setCourseTitle(event.target.value)}
                    placeholder="Data Structures"
                    maxLength={120}
                    required
                  />

                  <label htmlFor="course-credit" className="field-label">
                    Credit
                  </label>
                  <input
                    id="course-credit"
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={courseCredit}
                    onChange={(event) => setCourseCredit(event.target.value)}
                    required
                  />

                  <button type="submit">Save Course</button>
                </form>

                {error ? <p className="feedback error">{error}</p> : null}
                {success ? <p className="feedback success">{success}</p> : null}
              </section>
            </div>
          </>
        ) : null}

        {selectedTerm && mode !== 'guest' ? (
          <p className="empty-state">Switch to guest mode to use offline course creation for this term right now.</p>
        ) : null}
      </section>
    </main>
  );
}

function AuthPage({ session }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [authView, setAuthView] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [programCode, setProgramCode] = useState(PROGRAM_OPTIONS[0].code);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProgram = useMemo(() => {
    return PROGRAM_OPTIONS.find((program) => program.code === programCode) || PROGRAM_OPTIONS[0];
  }, [programCode]);

  useEffect(() => {
    const view = new URLSearchParams(location.search).get('view');
    if (view === 'sign-in' || view === 'sign-up' || view === 'forgot' || view === 'reset') {
      setAuthView(view);
    }
  }, [location.search]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }
    if (authView === 'reset') {
      return;
    }
    navigate('/dashboard', { replace: true });
  }, [authView, navigate, session]);

  const switchView = (view) => {
    setAuthView(view);
    setError('');
    setSuccess('');
  };

  const ensureSupabase = () => {
    if (!hasSupabaseEnv || !supabase) {
      throw new Error(supabaseEnvMessage);
    }
  };

  const onSignIn = async () => {
    ensureSupabase();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      throw signInError;
    }

    navigate('/dashboard', { replace: true });
  };

  const onSignUp = async () => {
    ensureSupabase();

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (password !== confirmPassword) {
      throw new Error('Password and confirm password do not match');
    }

    await createAccount({
      email: email.trim(),
      password,
      full_name: fullName.trim(),
      program_code: selectedProgram.code,
      program_title: selectedProgram.title,
      program_level: selectedProgram.level,
      program_credits: selectedProgram.credits,
    });

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      throw signInError;
    }

    navigate('/dashboard', { replace: true });
  };

  const onForgotPassword = async () => {
    ensureSupabase();

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth?view=reset`,
    });

    if (resetError) {
      throw resetError;
    }

    setSuccess('Password reset email sent. Check your inbox.');
  };

  const onResetPassword = async () => {
    ensureSupabase();

    if (password.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    if (password !== confirmPassword) {
      throw new Error('Password and confirm password do not match');
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      throw updateError;
    }

    setSuccess('Password updated successfully. Redirecting to dashboard...');
    setTimeout(() => {
      navigate('/dashboard', { replace: true });
    }, 900);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (authView === 'sign-in') {
        await onSignIn();
      } else if (authView === 'sign-up') {
        await onSignUp();
      } else if (authView === 'forgot') {
        await onForgotPassword();
      } else if (authView === 'reset') {
        await onResetPassword();
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card reveal">
        <p className="eyebrow">Secure Access</p>
        <h1 className="auth-title">Sign In to Sync Your Marks</h1>
        <p className="muted auth-copy">
          Use your GradeStack account credentials. New users can create an account. This app supports all departments.
        </p>
        {!hasSupabaseEnv ? <p className="feedback error auth-config-note">{supabaseEnvMessage}</p> : null}

        <div className="auth-switch" role="tablist" aria-label="Authentication views">
          <button
            type="button"
            className={authView === 'sign-in' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchView('sign-in')}
          >
            Log In
          </button>
          <button
            type="button"
            className={authView === 'sign-up' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchView('sign-up')}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={authView === 'forgot' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => switchView('forgot')}
          >
            Forgot Password
          </button>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          {authView === 'sign-up' ? (
            <>
              <label htmlFor="full-name" className="field-label">
                Full Name
              </label>
              <input
                id="full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your full name"
                maxLength={120}
                required
              />

              <label htmlFor="program-code" className="field-label">
                Academic Program (All Departments)
              </label>
              <select
                id="program-code"
                value={programCode}
                onChange={(event) => setProgramCode(event.target.value)}
                className="select-field"
                required
              >
                {PROGRAM_OPTIONS.map((program) => (
                  <option key={program.code} value={program.code}>
                    {buildProgramLabel(program)}
                  </option>
                ))}
              </select>
            </>
          ) : null}

          {authView !== 'reset' ? (
            <>
              <label htmlFor="email" className="field-label">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </>
          ) : null}

          {authView !== 'forgot' ? (
            <>
              <label htmlFor="password" className="field-label">
                {authView === 'reset' ? 'New Password' : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete={authView === 'reset' ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </>
          ) : null}

          {authView === 'sign-up' || authView === 'reset' ? (
            <>
              <label htmlFor="confirm-password" className="field-label">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </>
          ) : null}

          <button type="submit" disabled={submitting || !hasSupabaseEnv}>
            {submitting
              ? 'Please wait...'
              : authView === 'sign-in'
              ? 'Log In'
              : authView === 'sign-up'
              ? 'Create Account'
              : authView === 'forgot'
              ? 'Send Reset Email'
              : 'Update Password'}
          </button>
        </form>

        {authView === 'sign-in' ? (
          <button type="button" className="inline-link" onClick={() => switchView('forgot')}>
            Forgot your password?
          </button>
        ) : null}

        {authView === 'forgot' || authView === 'reset' ? (
          <button type="button" className="inline-link" onClick={() => switchView('sign-in')}>
            Back to login
          </button>
        ) : null}

        {error ? <p className="feedback error">{error}</p> : null}
        {success ? <p className="feedback success">{success}</p> : null}

        <button type="button" className="secondary auth-back" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </section>
    </main>
  );
}

function App() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!hasSupabaseEnv || !supabase) {
      setAuthReady(true);
      return;
    }

    let mounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) {
        return;
      }
      if (error) {
        setSession(null);
      } else {
        setSession(data.session || null);
      }
      setAuthReady(true);
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const onLogout = async () => {
    if (!hasSupabaseEnv || !supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
  };

  if (!authReady) {
    return (
      <main className="auth-loading-shell">
        <div className="auth-loading-card">Preparing your secure session...</div>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardPage session={session} onLogout={onLogout} />} />
      <Route path="/dashboard/terms/:termId" element={<TermWorkspacePage session={session} />} />
      <Route path="/auth" element={<AuthPage session={session} />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
