import React from 'react';
import {
  Input,
  Checkbox,
  Label,
  DatePicker,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@marche/ui';
import type { PublicCategoryTemplateField } from '../../lib/category-templates-api';

export type CategoryDataValues = Record<string, unknown>;

// Sensible starting values for a field the answer set doesn't mention yet.
// BOOLEAN defaults to false and MULTI_SELECT to an empty array — both are
// "explicit answers", never "unanswered" — matching what their controls
// visually show before anything is touched.
export function defaultCategoryData(fields: PublicCategoryTemplateField[]): CategoryDataValues {
  const values: CategoryDataValues = {};
  for (const field of fields) {
    if (field.type === 'BOOLEAN') values[field.key] = false;
    else if (field.type === 'MULTI_SELECT') values[field.key] = [];
  }
  return values;
}

// Mirrors CategoryTemplatesService.assertFieldValue's per-type shape checks.
// One deliberate difference: `required` here means "meaningfully answered"
// (a trimmed-empty string, an unselected SELECT, or an empty MULTI_SELECT
// all count as unanswered), where the backend's own required check is
// presence-only (undefined/null). This is stricter than the backend, never
// laxer — anything this accepts, the backend also accepts — and reads as
// the behavior a "required" label actually implies on a form.
export function validateCategoryData(
  fields: PublicCategoryTemplateField[],
  values: CategoryDataValues,
): Record<string, string | null> {
  const errors: Record<string, string | null> = {};
  for (const field of fields) {
    errors[field.key] = validateField(field, values[field.key]);
  }
  return errors;
}

function validateField(field: PublicCategoryTemplateField, value: unknown): string | null {
  switch (field.type) {
    case 'TEXT': {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      if (field.required && !trimmed) return `${field.label} is required.`;
      const validation = (field.validation ?? {}) as { minLength?: number; maxLength?: number };
      if (
        trimmed &&
        typeof validation.minLength === 'number' &&
        trimmed.length < validation.minLength
      ) {
        return `${field.label} must be at least ${validation.minLength} characters.`;
      }
      if (
        trimmed &&
        typeof validation.maxLength === 'number' &&
        trimmed.length > validation.maxLength
      ) {
        return `${field.label} must be at most ${validation.maxLength} characters.`;
      }
      return null;
    }
    case 'NUMBER': {
      const isEmpty = value === undefined || value === null || value === '';
      if (field.required && isEmpty) return `${field.label} is required.`;
      if (isEmpty) return null;
      const num = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(num)) return `${field.label} must be a number.`;
      const validation = (field.validation ?? {}) as { min?: number; max?: number };
      if (typeof validation.min === 'number' && num < validation.min) {
        return `${field.label} must be at least ${validation.min}.`;
      }
      if (typeof validation.max === 'number' && num > validation.max) {
        return `${field.label} must be at most ${validation.max}.`;
      }
      return null;
    }
    case 'BOOLEAN':
      // The backend's own required check for BOOLEAN is presence-only, and
      // a checkbox always holds an explicit true/false once defaultCategoryData
      // has run — never genuinely absent, so there is nothing to enforce here.
      return null;
    case 'SELECT': {
      if (field.required && !value) return `${field.label} is required.`;
      if (value && typeof value === 'string' && !(field.options ?? []).includes(value)) {
        return `${field.label} has an invalid selection.`;
      }
      return null;
    }
    case 'MULTI_SELECT': {
      const selected = Array.isArray(value) ? (value as unknown[]) : [];
      if (field.required && selected.length === 0) return `${field.label} is required.`;
      const options = field.options ?? [];
      if (selected.some((v) => typeof v !== 'string' || !options.includes(v))) {
        return `${field.label} has an invalid selection.`;
      }
      return null;
    }
    case 'DATE': {
      const isEmpty = value === undefined || value === null || value === '';
      if (field.required && isEmpty) return `${field.label} is required.`;
      if (!isEmpty && (typeof value !== 'string' || Number.isNaN(new Date(value).getTime()))) {
        return `${field.label} must be a valid date.`;
      }
      return null;
    }
  }
}

interface CategoryRequirementsFieldsProps {
  fields: PublicCategoryTemplateField[];
  values: CategoryDataValues;
  onChange: (key: string, value: unknown) => void;
  showErrors: boolean;
}

// The client-facing counterpart to the admin's TemplateFieldEditor — that
// one edits a template's field *definitions*; this one collects a client's
// *answers* to an already-published template. Local to this feature, not a
// generic form engine, mirroring the same scope decision the admin editor
// made for its own field editor.
export const CategoryRequirementsFields: React.FC<CategoryRequirementsFieldsProps> = ({
  fields,
  values,
  onChange,
  showErrors,
}) => {
  const errors = validateCategoryData(fields, values);
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {sortedFields.map((field) => {
        const error = showErrors ? errors[field.key] : null;
        const value = values[field.key];

        return (
          <div key={field.key}>
            {field.type !== 'BOOLEAN' && (
              <label className="block text-xs font-semibold text-ink mb-1">
                {field.label}
                {field.required && <span className="text-destructive"> *</span>}
              </label>
            )}

            {field.type === 'TEXT' && (
              <Input
                type="text"
                data-testid={`category-field-${field.key}`}
                value={(value as string) ?? ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                aria-invalid={Boolean(error)}
              />
            )}

            {field.type === 'NUMBER' && (
              <Input
                type="number"
                data-testid={`category-field-${field.key}`}
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) =>
                  onChange(field.key, e.target.value === '' ? undefined : Number(e.target.value))
                }
                aria-invalid={Boolean(error)}
              />
            )}

            {field.type === 'BOOLEAN' && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`category-field-${field.key}`}
                  data-testid={`category-field-${field.key}`}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => onChange(field.key, checked === true)}
                />
                <Label htmlFor={`category-field-${field.key}`} className="text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
              </div>
            )}

            {field.type === 'SELECT' && (
              <Select value={(value as string) ?? ''} onValueChange={(v) => onChange(field.key, v)}>
                <SelectTrigger
                  data-testid={`category-field-${field.key}`}
                  aria-invalid={Boolean(error)}
                >
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {field.type === 'MULTI_SELECT' && (
              <div
                className="flex items-center gap-2 flex-wrap"
                data-testid={`category-field-${field.key}`}
              >
                {(field.options ?? []).map((option) => {
                  const selected = Array.isArray(value) ? (value as string[]) : [];
                  const isSelected = selected.includes(option);
                  return (
                    <Button
                      key={option}
                      type="button"
                      size="sm"
                      variant={isSelected ? 'primary' : 'outline'}
                      data-testid={`category-field-${field.key}-option-${option}`}
                      onClick={() =>
                        onChange(
                          field.key,
                          isSelected ? selected.filter((o) => o !== option) : [...selected, option],
                        )
                      }
                    >
                      {option}
                    </Button>
                  );
                })}
              </div>
            )}

            {field.type === 'DATE' && (
              <DatePicker
                data-testid={`category-field-${field.key}`}
                value={(value as string) ?? ''}
                onChange={(v) => onChange(field.key, v)}
              />
            )}

            {error && <p className="text-[11px] text-destructive mt-1 font-medium">{error}</p>}
          </div>
        );
      })}
    </div>
  );
};
