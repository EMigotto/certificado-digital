import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TableSkeleton } from '@/components/LoadingSkeleton/TableSkeleton';
import { DetailSkeleton } from '@/components/LoadingSkeleton/DetailSkeleton';

describe('TableSkeleton', () => {
  it('renders the correct number of rows', () => {
    const { container } = render(<TableSkeleton rows={5} columns={6} />);
    const rows = container.querySelectorAll('.tableRow');
    expect(rows).toHaveLength(5);
  });

  it('renders header row', () => {
    const { container } = render(<TableSkeleton />);
    const header = container.querySelector('.tableHeader');
    expect(header).toBeInTheDocument();
  });

  it('renders with custom row count', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const rows = container.querySelectorAll('.tableRow');
    expect(rows).toHaveLength(3);
  });

  it('renders table wrapper with correct styles', () => {
    const { container } = render(<TableSkeleton />);
    const wrapper = container.querySelector('.tableWrap');
    expect(wrapper).toBeInTheDocument();
  });

  it('renders skeleton elements with shimmer animation class', () => {
    const { container } = render(<TableSkeleton />);
    const skeletons = container.querySelectorAll('.skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

describe('DetailSkeleton', () => {
  it('renders breadcrumb skeleton', () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector('.breadcrumbSkeleton')).toBeInTheDocument();
  });

  it('renders title skeleton', () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector('.titleSkeleton')).toBeInTheDocument();
  });

  it('renders info grid with 6 items', () => {
    const { container } = render(<DetailSkeleton />);
    const items = container.querySelectorAll('.infoItem');
    expect(items).toHaveLength(6);
  });

  it('renders action button skeletons', () => {
    const { container } = render(<DetailSkeleton />);
    const buttons = container.querySelectorAll('.buttonSkeleton');
    expect(buttons).toHaveLength(3);
  });

  it('renders badge skeleton', () => {
    const { container } = render(<DetailSkeleton />);
    expect(container.querySelector('.badgeSkeleton')).toBeInTheDocument();
  });
});
