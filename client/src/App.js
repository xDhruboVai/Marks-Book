import { useEffect, useMemo, useState } from 'react';
import { createTerm, deleteTerm, fetchTerms, updateTerm } from './api/marksApi';
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

function App() {
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

  const testUserId = (process.env.REACT_APP_TEST_USER_ID || '').trim();
  const mode = testUserId ? 'api' : 'guest';

  const terms = useMemo(() => {
    return mode === 'api' ? apiTerms : localTerms;
  }, [mode, apiTerms, localTerms]);

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
          mode === 'api'
            ? 'Your progress is synced to your account.'
            : 'Create an account or log in to save your progress.',
      },
    ],
    [latestTerm, mode, terms.length]
  );

  const refreshApiTerms = async () => {
    if (!testUserId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchTerms(testUserId);
      setApiTerms(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load terms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mode === 'api') {
      refreshApiTerms();
    }
  }, [mode]);

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
          user_id: testUserId,
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
          </div>
        </div>

        <div className="stats-grid">
          {stats.map((stat, index) => (
            <article key={stat.label} className={`stat-card stagger-${(index % 3) + 1} ${stat.tone}`}>
              <p className="stat-label">{stat.label}</p>
              <p className="stat-value">{stat.value}</p>
              {stat.note ? <p className="stat-note">{stat.note}</p> : null}
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
                      <p className="term-name">{term.term_name}</p>
                      <p className="term-meta">Created {formatDate(term.created_at)}</p>
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
                    <>
                      <button type="button" className="secondary" onClick={() => startEditing(term)} disabled={loading}>
                        Edit
                      </button>
                      <button type="button" className="secondary danger" onClick={() => onDeleteTerm(term.id)} disabled={loading}>
                        Delete
                      </button>
                    </>
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

export default App;
