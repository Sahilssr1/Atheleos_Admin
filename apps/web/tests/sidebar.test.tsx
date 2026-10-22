import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext';
import AppLayout, { NAV_ITEMS } from '../src/layout/AppLayout';
import { jsonOk, mockFetch, staffUser } from './test-utils';
import { PERMISSIONS } from '@atheleos/shared';

describe('sidebar permission gating', () => {
  it('hides nav items the staff user lacks permission for', async () => {
    // Support role: has dashboard.view, users.view, support.view, email.view…
    mockFetch(() => jsonOk(staffUser()));
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout><div>page body</div></AppLayout>
        </AuthProvider>
      </MemoryRouter>,
    );

    // Visible to support
    expect(await screen.findByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Support Tickets')).toBeInTheDocument();
    expect(screen.getByText('Email Center')).toBeInTheDocument();

    // Not granted to support → must not render
    expect(screen.queryByText('Admin Team')).not.toBeInTheDocument();
    expect(screen.queryByText('Roles & Permissions')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Logs')).not.toBeInTheDocument();
    expect(screen.queryByText('Moderation')).not.toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Messages')).not.toBeInTheDocument();
  });

  it('shows every nav item to a super admin', async () => {
    mockFetch(() => jsonOk(staffUser({ role: 'super_admin', permissions: [...PERMISSIONS] })));
    render(
      <MemoryRouter>
        <AuthProvider>
          <AppLayout><div>page body</div></AppLayout>
        </AuthProvider>
      </MemoryRouter>,
    );
    for (const item of NAV_ITEMS) {
      expect(await screen.findByText(item.label)).toBeInTheDocument();
    }
  });
});
