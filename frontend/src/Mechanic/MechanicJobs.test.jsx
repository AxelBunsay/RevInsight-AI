import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import MechanicJobs from './MechanicJobs';

describe('mechanic jobs filters', () => {
  it('shows labeled filters and the Any date default', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/mechanic/jobs']}>
        <MechanicJobs />
      </MemoryRouter>
    );

    expect(markup).toContain('<span>Search</span>');
    expect(markup).toContain('<span>Status</span>');
    expect(markup).toContain('<span>Priority</span>');
    expect(markup).toContain('<span>Date created</span>');
    expect(markup).toContain('Any date');
    expect(markup).toContain('0 jobs');
  });
});
