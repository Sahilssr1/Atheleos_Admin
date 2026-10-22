import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/auth/AuthContext';
import Login from '../src/pages/Login';
import { jsonOk, mockFetch, staffUser } from './test-utils';

describe('Login page', () => {
  it('renders the form and submits credentials to /auth/login', async () => {
    const calls = mockFetch((url, init) => {
      if (url.includes('/auth/login') && init?.method === 'POST') return jsonOk(staffUser());
      return jsonOk(staffUser());
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument();
    // No public registration anywhere on the page.
    expect(screen.queryByText(/register|sign up/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@atheleos.app' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => {
      const loginCall = calls.find((c) => c.url.includes('/auth/login') && c.init?.method === 'POST');
      expect(loginCall).toBeTruthy();
      const body = JSON.parse(String(loginCall!.init!.body));
      expect(body).toEqual({ email: 'admin@atheleos.app', password: 'correct horse battery' });
    });
  });

  it('shows the MFA step when the API asks for a code', async () => {
    mockFetch((url, init) => {
      if (url.includes('/auth/login') && init?.method === 'POST') {
        return jsonOk({ mfaRequired: true, mfaToken: 'tok-123' });
      }
      if (url.includes('/auth/mfa/verify')) return jsonOk(staffUser());
      return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } } };
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'admin@atheleos.app' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByLabelText('Verification code')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify & continue' }));
    // Successful verify navigates away (no error shown).
    await waitFor(() => expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument());
  });

  it('surfaces API login errors', async () => {
    mockFetch((url, init) => {
      if (url.includes('/auth/login') && init?.method === 'POST') {
        return { status: 401, body: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } } };
      }
      return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Not signed in' } } };
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>,
    );
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();
  });
});
