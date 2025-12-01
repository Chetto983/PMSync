import React from 'react';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { SearchHighlight, useSearchMatch } from './SearchHighlight';

const theme = createTheme();

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('SearchHighlight', () => {
  describe('Basic Rendering', () => {
    it('should render text without query', () => {
      renderWithTheme(<SearchHighlight text="Hello world" />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should render text with empty query', () => {
      renderWithTheme(<SearchHighlight text="Hello world" query="" />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('should render text when disabled', () => {
      renderWithTheme(<SearchHighlight text="Hello world" query="world" enabled={false} />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.queryByRole('mark')).not.toBeInTheDocument();
    });
  });

  describe('Single Term Highlighting', () => {
    it('should highlight a single word', () => {
      renderWithTheme(<SearchHighlight text="Hello world!" query="world" />);

      const mark = screen.getByText('world');
      expect(mark.tagName).toBe('MARK');
    });

    it('should highlight case-insensitively', () => {
      renderWithTheme(<SearchHighlight text="Hello WORLD!" query="world" />);

      const mark = screen.getByText('WORLD');
      expect(mark.tagName).toBe('MARK');
    });

    it('should highlight at the beginning', () => {
      renderWithTheme(<SearchHighlight text="World is great" query="world" />);

      const mark = screen.getByText('World');
      expect(mark.tagName).toBe('MARK');
    });

    it('should highlight at the end', () => {
      renderWithTheme(<SearchHighlight text="Hello world" query="world" />);

      const mark = screen.getByText('world');
      expect(mark.tagName).toBe('MARK');
    });
  });

  describe('Multiple Terms Highlighting', () => {
    it('should highlight multiple words', () => {
      renderWithTheme(<SearchHighlight text="Hello world, how are you?" query="hello you" />);

      expect(screen.getByText('Hello').tagName).toBe('MARK');
      expect(screen.getByText('you').tagName).toBe('MARK');
    });

    it('should highlight multiple occurrences of same term', () => {
      renderWithTheme(<SearchHighlight text="test one test two test three" query="test" />);

      const marks = screen.getAllByText('test');
      expect(marks).toHaveLength(3);
      marks.forEach((mark) => expect(mark.tagName).toBe('MARK'));
    });
  });

  describe('Quoted Phrase Highlighting', () => {
    it('should highlight exact phrase in quotes', () => {
      renderWithTheme(
        <SearchHighlight text="The quick brown fox jumps" query='"quick brown"' />
      );

      const mark = screen.getByText('quick brown');
      expect(mark.tagName).toBe('MARK');
    });

    it('should handle mixed quoted and unquoted terms', () => {
      renderWithTheme(
        <SearchHighlight text="Hello world, how are you today?" query='"how are" today' />
      );

      expect(screen.getByText('how are').tagName).toBe('MARK');
      expect(screen.getByText('today').tagName).toBe('MARK');
    });
  });

  describe('No Match Cases', () => {
    it('should not highlight when no match found', () => {
      renderWithTheme(<SearchHighlight text="Hello world" query="foo" />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.queryByRole('mark')).not.toBeInTheDocument();
    });

    it('should handle special regex characters in query', () => {
      renderWithTheme(
        <SearchHighlight text="Price is $100 (sale)" query="$100" />
      );

      const mark = screen.getByText('$100');
      expect(mark.tagName).toBe('MARK');
    });
  });

  describe('Text Truncation', () => {
    it('should truncate text when maxLength is set', () => {
      renderWithTheme(
        <SearchHighlight
          text="This is a very long text that should be truncated"
          maxLength={20}
        />
      );

      // Text should be truncated with ellipsis
      const container = screen.getByText((content, element) => {
        return element?.tagName === 'SPAN' && content.includes('This is a very long');
      });
      expect(container).toBeInTheDocument();
      expect(container.textContent).toContain('...');
    });

    it('should preserve highlighting when truncating', () => {
      renderWithTheme(
        <SearchHighlight
          text="Hello world is great today"
          query="world"
          maxLength={20}
        />
      );

      // World should be highlighted
      const mark = screen.getByText('world');
      expect(mark.tagName).toBe('MARK');
    });
  });

  describe('Context Mode', () => {
    it('should show context around first match', () => {
      const longText =
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. The keyword is here. Sed do eiusmod tempor.';

      renderWithTheme(
        <SearchHighlight
          text={longText}
          query="keyword"
          showContext
          contextLength={20}
        />
      );

      // Should have ellipsis prefix since match is not at start
      expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
      expect(screen.getByText('keyword').tagName).toBe('MARK');
    });
  });

  describe('Custom Styling', () => {
    it('should render with custom component', () => {
      renderWithTheme(
        <SearchHighlight text="Hello world" component="div" />
      );

      const container = screen.getByText('Hello world');
      expect(container.tagName).toBe('DIV');
    });

    it('should apply custom className', () => {
      renderWithTheme(
        <SearchHighlight text="Hello world" className="custom-class" />
      );

      const container = screen.getByText('Hello world');
      expect(container.className).toContain('custom-class');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      renderWithTheme(<SearchHighlight text="" query="test" />);
      // Should not throw
    });

    it('should handle whitespace-only query', () => {
      renderWithTheme(<SearchHighlight text="Hello world" query="   " />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.queryByRole('mark')).not.toBeInTheDocument();
    });

    it('should handle overlapping matches', () => {
      renderWithTheme(
        <SearchHighlight text="abcdefgh" query="bcd cde" />
      );

      // Should merge overlapping matches into one
      const marks = screen.getAllByRole('mark');
      expect(marks.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('useSearchMatch', () => {
  function TestComponent({ text, query }: { text: string; query?: string }) {
    const hasMatch = useSearchMatch(text, query);
    return <div data-testid="result">{hasMatch ? 'match' : 'no-match'}</div>;
  }

  it('should return true when text contains query term', () => {
    renderWithTheme(<TestComponent text="Hello world" query="world" />);
    expect(screen.getByTestId('result')).toHaveTextContent('match');
  });

  it('should return false when text does not contain query term', () => {
    renderWithTheme(<TestComponent text="Hello world" query="foo" />);
    expect(screen.getByTestId('result')).toHaveTextContent('no-match');
  });

  it('should return false with empty query', () => {
    renderWithTheme(<TestComponent text="Hello world" query="" />);
    expect(screen.getByTestId('result')).toHaveTextContent('no-match');
  });

  it('should be case insensitive', () => {
    renderWithTheme(<TestComponent text="Hello WORLD" query="world" />);
    expect(screen.getByTestId('result')).toHaveTextContent('match');
  });
});
