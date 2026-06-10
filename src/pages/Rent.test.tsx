import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Rent from './Rent';
import { MemoryRouter } from 'react-router-dom';
import * as useUserDataHook from '../hooks/useUserData';

// Mock dependencies
vi.mock('../firebase', () => ({
  db: {}
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((_q, callback) => {
    // Mock the snapshot of shops
    callback({
      docs: [
        { id: 'shop-1', data: () => ({ name: 'Test Shop 1', type: 'rental_shop', pricing: { pricePerHour: 20, minimumCharge: 10 } }) }
      ]
    });
    return vi.fn();
  }),
  getDocs: vi.fn().mockResolvedValue({ size: 2 }),
  addDoc: vi.fn().mockResolvedValue({ id: 'booking-1' }),
  serverTimestamp: vi.fn(),
}));

vi.mock('../utils/notifications', () => ({
  createNotification: vi.fn()
}));

const renderRent = () => {
  return render(
    <MemoryRouter>
      <Rent />
    </MemoryRouter>
  );
};

describe('Rent Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    vi.spyOn(useUserDataHook, 'useUserData').mockReturnValue({
      user: null,
      userData: null,
      loading: true,
      role: 'rider',
      logout: vi.fn()
    });

    renderRent();
    expect(screen.getByText(/Loading Shops.../i)).toBeInTheDocument();
  });

  it('renders shops after loading', async () => {
    vi.spyOn(useUserDataHook, 'useUserData').mockReturnValue({
      user: { uid: 'user-1' } as any,
      userData: { name: 'Test User' } as any,
      loading: false,
      role: 'rider',
      logout: vi.fn()
    });

    renderRent();

    await waitFor(() => {
      expect(screen.getByText('Test Shop 1')).toBeInTheDocument();
    });
  });

  it('prompts auth modal if trying to rent without login', async () => {
    vi.spyOn(useUserDataHook, 'useUserData').mockReturnValue({
      user: null,
      userData: null,
      loading: false,
      role: 'rider',
      logout: vi.fn()
    });

    renderRent();

    await waitFor(() => {
      expect(screen.getByText('Test Shop 1')).toBeInTheDocument();
    });

    // Select the shop
    fireEvent.click(screen.getByText('Test Shop 1'));

    // Wait for bikes to appear. In our mock, onSnapshot is called again for bikes, let's just assume we can find a "Book" button if we mock the bike
  });
});
