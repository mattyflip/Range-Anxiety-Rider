import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NavBar from './NavBar';

// Mock dependencies
vi.mock('../../firebase', () => ({
  auth: {
    currentUser: null,
    onAuthStateChanged: vi.fn(),
  },
  db: {},
}));

vi.mock('../../hooks/useUserData', () => ({
  useUserData: vi.fn(() => ({
    user: null,
    userData: null,
    loading: false,
  })),
}));

describe('NavBar Component', () => {
  const defaultProps = {
    user: null,
    onShowInstall: vi.fn(),
    onShowAuth: vi.fn(),
  };

  it('renders sign in button when not logged in', () => {
    render(
      <MemoryRouter>
        <NavBar {...defaultProps} />
      </MemoryRouter>
    );
    
    // Using a more flexible matcher for "Login"
    expect(screen.getByText(/Login/i)).toBeInTheDocument();
  });

  it('triggers onShowAuth when Login is clicked', () => {
    render(
      <MemoryRouter>
        <NavBar {...defaultProps} />
      </MemoryRouter>
    );
    
    fireEvent.click(screen.getByText(/Login/i));
    expect(defaultProps.onShowAuth).toHaveBeenCalled();
  });
});
