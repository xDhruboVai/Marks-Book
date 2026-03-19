import { useEffect, useMemo, useState } from 'react';
import { createTerm, fetchTerms } from './api/marksApi';
import { useMarksStore } from './hooks/useMarksStore';

function App() {
  const { terms: localTerms, createLocalTerm } = useMarksStore();
  const [termName, setTermName] = useState('');
  const [apiTerms, setApiTerms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const testUserId = (process.env.REACT_APP_TEST_USER_ID || '').trim();
  const mode = testUserId ? 'api' : 'guest';

  const terms = useMemo(() => {
    return mode === 'api' ? apiTerms : localTerms;
  }, [mode, apiTerms, localTerms]);

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <h1>Marks Book</h1>
          <p className="muted">Baby Step 1: Create and list terms</p>
        </div>
        <span className="pill">Mode: {mode === 'api' ? 'API' : 'Guest Local'}</span>
      </header>

      <section className="grid">
        <article className="panel">
          <h2>Create Term</h2>
          <p className="muted">
            Enter a semester name (for example: Fall 2026).
          </p>
          <form onSubmit={onSubmit}>
            <div className="row">
              <input
                value={termName}
                onChange={(event) => setTermName(event.target.value)}
                placeholder="Fall 2026"
                maxLength={80}
              />
              <button type="submit" disabled={loading || !termName.trim()}>
                Save
              </button>
            </div>
          </form>
          {error ? <p className="error">{error}</p> : null}
          {success ? <p className="success">{success}</p> : null}
        </article>

        <article className="panel">
          <div className="app-header" style={{ marginBottom: '0.5rem' }}>
            <h2 style={{ marginBottom: 0 }}>Terms</h2>
            {mode === 'api' ? (
              <button type="button" className="secondary" onClick={refreshApiTerms} disabled={loading}>
                Refresh
              </button>
            ) : null}
          </div>
          <p className="muted">Total: {terms.length}</p>

          {loading ? <p>Loading...</p> : null}
          {!terms.length && !loading ? <p className="muted">No terms yet.</p> : null}

          <ol className="term-list">
            {terms.map((term) => (
              <li key={term.id}>
                {term.term_name}
                <span className="muted"> ({new Date(term.created_at).toLocaleDateString()})</span>
              </li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}

export default App;
