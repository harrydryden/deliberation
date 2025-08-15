import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import userEvent from '@testing-library/user-event';
import { AuthForm } from '../AuthForm';

describe('AuthForm', () => {
  it('renders sign in form by default', () => {
    render(<AuthForm />);
    
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('switches to sign up mode when clicking sign up link', async () => {
    const user = userEvent.setup();
    render(<AuthForm />);
    
    await user.click(screen.getByText(/don't have an account/i));
    
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /sign up/i })).toBeInTheDocument();
    });
  });
});