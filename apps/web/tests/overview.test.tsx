import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DashboardOverview, MetricValue } from '@atheleos/shared';
import Overview from '../src/pages/Overview';
import { jsonOk, mockFetch } from './test-utils';

const avail = (value: number): MetricValue => ({ value, available: true });
const missing = (note: string): MetricValue => ({ value: null, available: false, note });

const overview: DashboardOverview = {
  range: '30d',
  totals: {
    users: avail(1204),
    newUsers: avail(37),
    activeUsers: missing('Active-user tracking is not recorded by the app yet'),
    suspendedUsers: avail(3),
    posts: avail(42),
    clips: avail(11),
    stories: avail(5),
    comments: missing('Comment counts unavailable'),
    reportsOpen: avail(7),
    moderationPending: avail(2),
    supportOpen: avail(4),
    emailsQueued: avail(1),
    emailsDelivered: avail(88),
    emailsFailed: avail(2),
    notificationsSent: avail(1500),
  },
  series: {
    registrations: [{ date: '2026-10-01', count: 3 }, { date: '2026-10-02', count: 9 }],
    content: [{ date: '2026-10-01', count: 4 }],
    reports: [],
  },
  recentActions: [],
  health: { firestore: true, email: false, messaging: true },
};

describe('Overview dashboard', () => {
  it('renders numbers for available metrics and "Not available" for null MetricValues', async () => {
    mockFetch(() => jsonOk(overview));
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    );

    expect(await screen.findByText('1,204')).toBeInTheDocument(); // total users
    expect(screen.getByText('42')).toBeInTheDocument(); // posts
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(2); // activeUsers + comments
    expect(screen.getByText('Active-user tracking is not recorded by the app yet')).toBeInTheDocument();
    expect(screen.getByText('No administrative actions recorded yet.')).toBeInTheDocument();
    // Health chips come from the payload
    expect(screen.getByText(/Firestore \/ app data/)).toBeInTheDocument();
  });
});
