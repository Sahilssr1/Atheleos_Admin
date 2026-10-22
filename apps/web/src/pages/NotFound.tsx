import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="page">
      <div className="state-box">
        <div className="state-icon" aria-hidden><Compass /></div>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Page not found</div>
        <p className="small">This admin route doesn’t exist. <Link to="/">Back to Overview →</Link></p>
      </div>
    </div>
  );
}
