import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import LoadingScreen from './LoadingScreen';

describe('LoadingScreen', () => {
  it('displays the default message when no prop is provided', () => {
    render(<LoadingScreen />);
    expect(screen.getByText('INITIALIZING SYSTEM...')).toBeInTheDocument();
  });

  it('displays the message prop when provided', () => {
    render(<LoadingScreen message="TESTING..." />);
    expect(screen.getByText('TESTING...')).toBeInTheDocument();
  });

  it('renders the logo with correct alt text', () => {
    render(<LoadingScreen />);
    const logo = screen.getByAltText('Range Anxiety Logo');
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute('src', '/logo.png');
  });
});
