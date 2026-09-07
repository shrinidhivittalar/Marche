import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCreateJobForm } from './useCreateJobForm';
import type { ApiCategory } from '../../../lib/marketplace-api';

vi.mock('../../../context/AppContext', () => ({
  useApp: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    accessToken: 'test-token',
  }),
}));

const categories: ApiCategory[] = [
  {
    id: 'cat-photo',
    name: 'Photography',
    slug: 'photography',
    description: null,
    icon: null,
    parentId: null,
    displayOrder: 0,
  },
  {
    id: 'cat-catering',
    name: 'Catering',
    slug: 'catering',
    description: null,
    icon: null,
    parentId: null,
    displayOrder: 1,
  },
];

const noTemplate = { template: null };

vi.mock('../../../lib/marketplace-api', () => ({
  marketplaceApi: {
    categories: vi.fn(() => Promise.resolve(categories)),
  },
}));

vi.mock('../../../lib/category-templates-api', () => ({
  categoryTemplatesApi: {
    getActive: vi.fn(() => Promise.resolve(noTemplate)),
    getVersionPublic: vi.fn(() => Promise.resolve(noTemplate)),
  },
}));

vi.mock('../../../lib/jobs-api', () => ({
  AI_JOB_DRAFT_STORAGE_KEY: 'ai-job-draft',
  jobsApi: {
    mineById: vi.fn(),
    attachments: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    addAttachment: vi.fn(),
    removeAttachment: vi.fn(),
    rephraseField: vi.fn(),
  },
}));

vi.mock('../../../lib/media-api', () => ({
  mediaApi: {
    upload: vi.fn(),
  },
}));

async function renderForm() {
  const view = renderHook(() => useCreateJobForm(undefined));
  await waitFor(() => expect(view.result.current.categories.loading).toBe(false));
  return view;
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('useCreateJobForm — step validation', () => {
  it('step 1 is invalid until a category is picked', async () => {
    const { result } = await renderForm();
    expect(result.current.isStepValid(1)).toBe(false);

    act(() => result.current.handleSelectCategory('cat-photo'));
    await waitFor(() => expect(result.current.templateResource.loading).toBe(false));

    expect(result.current.isStepValid(1)).toBe(true);
  });

  it('step 2 requires a title of at least MIN_TITLE characters', async () => {
    const { result } = await renderForm();
    expect(result.current.isStepValid(2)).toBe(false);

    act(() => result.current.setTitle('ab'));
    expect(result.current.isStepValid(2)).toBe(false);

    act(() => result.current.setTitle('abc'));
    expect(result.current.isStepValid(2)).toBe(true);
  });

  it('step 2 treats a whitespace-only title as invalid', async () => {
    const { result } = await renderForm();
    act(() => result.current.setTitle('     '));
    expect(result.current.isStepValid(2)).toBe(false);
  });

  it('step 3 requires a description of at least MIN_DESCRIPTION characters', async () => {
    const { result } = await renderForm();
    expect(result.current.isStepValid(3)).toBe(false);

    act(() => result.current.setDescription('short'));
    expect(result.current.isStepValid(3)).toBe(false);

    act(() => result.current.setDescription('a'.repeat(20)));
    expect(result.current.isStepValid(3)).toBe(true);
  });

  it('step 4 passes with no date set (event date is optional)', async () => {
    const { result } = await renderForm();
    expect(result.current.isStepValid(4)).toBe(true);
  });

  it('step 4 requires eventEndTime after eventStartTime in fixed timing mode', async () => {
    const { result } = await renderForm();
    act(() => {
      result.current.setEventDate('2026-12-25');
      result.current.setTimingMode('fixed');
      result.current.setEventStartTime('20:00');
      result.current.setEventEndTime('18:00');
    });
    expect(result.current.isStepValid(4)).toBe(false);

    act(() => result.current.setEventEndTime('22:00'));
    expect(result.current.isStepValid(4)).toBe(true);
  });

  it('step 4 skips the time-order check in flexible timing mode', async () => {
    const { result } = await renderForm();
    act(() => {
      result.current.setEventDate('2026-12-25');
      result.current.setTimingMode('flexible');
    });
    expect(result.current.isStepValid(4)).toBe(true);
  });

  it('step 5 passes in fixed budget mode regardless of budgetMax', async () => {
    const { result } = await renderForm();
    act(() => {
      result.current.setBudgetMode('fixed');
      result.current.setBudgetMin(5000);
    });
    expect(result.current.isStepValid(5)).toBe(true);
  });

  it('step 5 treats a zero budgetMax as "no upper bound" in range mode', async () => {
    const { result } = await renderForm();
    act(() => {
      result.current.setBudgetMode('range');
      result.current.setBudgetMin(5000);
      result.current.setBudgetMax(0);
    });
    expect(result.current.isStepValid(5)).toBe(true);
  });

  it('step 5 rejects a budgetMax below budgetMin in range mode', async () => {
    const { result } = await renderForm();
    act(() => {
      result.current.setBudgetMode('range');
      result.current.setBudgetMin(5000);
      result.current.setBudgetMax(1000);
    });
    expect(result.current.isStepValid(5)).toBe(false);
  });
});

describe('useCreateJobForm — navigation', () => {
  it('handleNext does not advance the step when the current step is invalid', async () => {
    const { result } = await renderForm();
    expect(result.current.step).toBe(1);

    act(() => result.current.handleNext());
    expect(result.current.step).toBe(1);
    expect(result.current.attemptedNext).toBe(true);
  });

  it('handleNext advances to the next step once the current step is valid', async () => {
    const { result } = await renderForm();
    act(() => result.current.handleSelectCategory('cat-photo'));
    await waitFor(() => expect(result.current.templateResource.loading).toBe(false));

    act(() => result.current.handleNext());
    expect(result.current.step).toBe(2);
    expect(result.current.attemptedNext).toBe(false);
  });

  it('handleBack calls goBack from step 1', async () => {
    const { result } = await renderForm();
    act(() => result.current.handleBack());
    expect(result.current.goBack).toHaveBeenCalledTimes(1);
  });

  it('handleBack steps back without calling goBack past step 1', async () => {
    const { result } = await renderForm();
    act(() => result.current.goToStep(3));
    act(() => result.current.handleBack());
    expect(result.current.step).toBe(2);
    expect(result.current.goBack).not.toHaveBeenCalled();
  });
});

describe('useCreateJobForm — category change resets template answers', () => {
  it('clears categoryData and serviceMode when switching to a different category', async () => {
    const { result } = await renderForm();
    act(() => result.current.handleSelectCategory('cat-photo'));
    await waitFor(() => expect(result.current.templateResource.loading).toBe(false));

    act(() => result.current.setCategoryData({ answer: 'yes' }));
    act(() => result.current.setServiceMode('ONSITE'));

    act(() => result.current.handleSelectCategory('cat-catering'));
    await waitFor(() => expect(result.current.categoryId).toBe('cat-catering'));

    expect(result.current.categoryData).toEqual({});
    expect(result.current.serviceMode).toBe('');
  });

  it('picking the same category twice is a no-op', async () => {
    const { result } = await renderForm();
    act(() => result.current.handleSelectCategory('cat-photo'));
    await waitFor(() => expect(result.current.categoryId).toBe('cat-photo'));

    act(() => result.current.setCategoryData({ answer: 'yes' }));
    act(() => result.current.handleSelectCategory('cat-photo'));

    expect(result.current.categoryData).toEqual({ answer: 'yes' });
  });
});

describe('useCreateJobForm — flatCategories', () => {
  it('flattens parent and child categories for lookup', async () => {
    const { result } = await renderForm();
    expect(result.current.flatCategories.map((c: ApiCategory) => c.id)).toEqual([
      'cat-photo',
      'cat-catering',
    ]);
  });
});
