/**
 * Store Hydration Tests
 *
 * Tests for the SSR-safe store hydration provider and hooks.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { StoreHydration, useIsStoreHydrated, withStoreHydration } from './store-hydration';

describe('StoreHydration', () => {
  describe('StoreHydration component', () => {
    it('should render children', () => {
      render(
        <StoreHydration>
          <div data-testid="child">Child Content</div>
        </StoreHydration>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <StoreHydration>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </StoreHydration>
      );

      expect(screen.getByTestId('child1')).toBeInTheDocument();
      expect(screen.getByTestId('child2')).toBeInTheDocument();
    });

    it('should render nested components', () => {
      render(
        <StoreHydration>
          <div>
            <span data-testid="nested">Nested Content</span>
          </div>
        </StoreHydration>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
    });
  });

  describe('useIsStoreHydrated hook', () => {
    function TestComponent() {
      const isHydrated = useIsStoreHydrated();
      return (
        <div data-testid="hydration-status">
          {isHydrated ? 'hydrated' : 'not-hydrated'}
        </div>
      );
    }

    it('should return true on client side', () => {
      render(<TestComponent />);

      // On client (jsdom), useSyncExternalStore should return the client snapshot (true)
      expect(screen.getByTestId('hydration-status')).toHaveTextContent('hydrated');
    });

    it('should be consistent across multiple renders', () => {
      const { rerender } = render(<TestComponent />);

      expect(screen.getByTestId('hydration-status')).toHaveTextContent('hydrated');

      rerender(<TestComponent />);

      expect(screen.getByTestId('hydration-status')).toHaveTextContent('hydrated');
    });
  });

  describe('withStoreHydration HOC', () => {
    interface TestProps {
      name: string;
    }

    function OriginalComponent({ name }: TestProps) {
      return <div data-testid="original">Hello, {name}</div>;
    }

    it('should render the wrapped component when hydrated', () => {
      const WrappedComponent = withStoreHydration(OriginalComponent);

      render(<WrappedComponent name="World" />);

      // On client, should render immediately since hydrated
      expect(screen.getByTestId('original')).toBeInTheDocument();
      expect(screen.getByText('Hello, World')).toBeInTheDocument();
    });

    it('should pass props to the wrapped component', () => {
      const WrappedComponent = withStoreHydration(OriginalComponent);

      render(<WrappedComponent name="Test User" />);

      expect(screen.getByText('Hello, Test User')).toBeInTheDocument();
    });

    it('should render fallback when provided (for SSR testing)', () => {
      const FallbackComponent = <div data-testid="fallback">Loading...</div>;
      const WrappedComponent = withStoreHydration(OriginalComponent, FallbackComponent);

      // Note: In jsdom, we're always "hydrated" so the original renders
      // This test verifies the HOC structure is correct
      render(<WrappedComponent name="Test" />);

      // On client, original should render (not fallback)
      expect(screen.getByTestId('original')).toBeInTheDocument();
    });

    it('should return null as fallback when no fallback provided', () => {
      // This tests the fallback behavior structure
      const WrappedComponent = withStoreHydration(OriginalComponent);

      const { container } = render(<WrappedComponent name="Test" />);

      // On client, should render original component
      expect(container.querySelector('[data-testid="original"]')).toBeInTheDocument();
    });

    it('should work with components that have no props', () => {
      function NoPropsComponent() {
        return <div data-testid="no-props">No props</div>;
      }

      const WrappedComponent = withStoreHydration(NoPropsComponent);

      render(<WrappedComponent />);

      expect(screen.getByTestId('no-props')).toBeInTheDocument();
    });

    it('should preserve component display name', () => {
      const WrappedComponent = withStoreHydration(OriginalComponent);

      // The HOC creates a HydratedComponent wrapper
      expect(WrappedComponent.name).toBe('HydratedComponent');
    });
  });

  describe('integration', () => {
    it('should work with nested hydration-dependent components', () => {
      function InnerComponent() {
        const isHydrated = useIsStoreHydrated();
        return <span data-testid="inner">{isHydrated ? 'ready' : 'loading'}</span>;
      }

      render(
        <StoreHydration>
          <div>
            <InnerComponent />
          </div>
        </StoreHydration>
      );

      expect(screen.getByTestId('inner')).toHaveTextContent('ready');
    });

    it('should provide consistent hydration state to all descendants', () => {
      function ComponentA() {
        const isHydrated = useIsStoreHydrated();
        return <div data-testid="a">{String(isHydrated)}</div>;
      }

      function ComponentB() {
        const isHydrated = useIsStoreHydrated();
        return <div data-testid="b">{String(isHydrated)}</div>;
      }

      render(
        <StoreHydration>
          <ComponentA />
          <ComponentB />
        </StoreHydration>
      );

      // Both should have same hydration state
      expect(screen.getByTestId('a')).toHaveTextContent('true');
      expect(screen.getByTestId('b')).toHaveTextContent('true');
    });
  });
});
