import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useFetch } from '../hooks/useFetch';
import { normalizeSearch, searchHref } from '../lib/types';
import { Card, EmptyState, ErrorState, Skeleton } from '../components/ui';

/** Full-page fallback for global search (topbar dropdown links here). */
export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, loading, error, reload } = useFetch(
    () => (q.trim() ? api.get(`/search?q=${encodeURIComponent(q.trim())}`) : Promise.resolve(null)),
    [q],
  );
  const groups = normalizeSearch(data as never);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Search results</h1>
        <p className="muted" style={{ margin: 0 }}>
          {q ? <>Results for “<strong>{q}</strong>” — only records you are authorized to see are included.</> : 'Type a query in the top search bar.'}
        </p>
      </div>
      {q && loading && !data ? <Skeleton height={200} /> : q && error ? <ErrorState error={error} onRetry={reload} /> : (
        groups.length === 0
          ? <EmptyState icon="🔍" title="No results" hint={q ? `Nothing found for “${q}”.` : 'Enter a search term above.'} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {groups.map((g) => (
                <Card flush key={g.kind}>
                  <div style={{ padding: '12px 16px 4px' }}><h2 style={{ textTransform: 'capitalize' }}>{g.label ?? g.kind} ({g.items.length})</h2></div>
                  <div className="table-wrap"><table className="table"><tbody>
                    {g.items.map((it) => (
                      <tr key={`${g.kind}-${it.id}`}>
                        <td>
                          <Link to={it.href ?? searchHref(g.kind, it.id)} style={{ fontWeight: 600 }}>{it.title}</Link>
                          {it.subtitle && <span className="small faint" style={{ display: 'block' }}>{it.subtitle}</span>}
                        </td>
                        <td className="mono small" style={{ textAlign: 'right' }}>{it.id}</td>
                      </tr>
                    ))}
                  </tbody></table></div>
                </Card>
              ))}
            </div>
          )
      )}
    </div>
  );
}
