import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Checkbox,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@marche/ui';
import type { CategoryTemplateFieldType } from '../../lib/category-templates-api';

// Local to the Admin Template Editor — a focused field-array editor for
// exactly the CreateCategoryTemplateFieldDto shape, not a generic
// form-builder. `order` is never edited directly; it is always the field's
// position in the array, per the backend's own convention (order defaults
// to array index).
export interface EditableField {
  key: string;
  label: string;
  type: CategoryTemplateFieldType;
  required: boolean;
  options: string[];
  validation: { min?: number; max?: number; minLength?: number; maxLength?: number };
}

const FIELD_TYPES: CategoryTemplateFieldType[] = [
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'DATE',
];
const OPTIONS_TYPES: CategoryTemplateFieldType[] = ['SELECT', 'MULTI_SELECT'];
const KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function emptyField(): EditableField {
  return { key: '', label: '', type: 'TEXT', required: false, options: [], validation: {} };
}

// One error string per field index, or null when that field is valid.
// Exported so the parent page can gate the submit button on it without
// re-deriving the same rules.
export function validateFields(fields: EditableField[]): (string | null)[] {
  const keyCounts = new Map<string, number>();
  for (const field of fields) {
    keyCounts.set(field.key, (keyCounts.get(field.key) ?? 0) + 1);
  }

  return fields.map((field) => {
    if (!field.key.trim()) return 'Key is required.';
    if (!KEY_PATTERN.test(field.key)) {
      return 'Key must be lowercase words separated by single hyphens (e.g. "guest-count").';
    }
    if ((keyCounts.get(field.key) ?? 0) > 1) return 'Key must be unique.';
    if (!field.label.trim()) return 'Label is required.';

    if (OPTIONS_TYPES.includes(field.type)) {
      const trimmed = field.options.map((o) => o.trim());
      if (trimmed.length === 0 || trimmed.some((o) => o.length === 0)) {
        return 'At least one non-empty option is required.';
      }
      if (new Set(trimmed).size !== trimmed.length) return 'Options must not repeat.';
    }

    if (field.type === 'NUMBER') {
      const { min, max } = field.validation;
      if (typeof min === 'number' && typeof max === 'number' && max < min) {
        return 'Max must be greater than or equal to min.';
      }
    }
    if (field.type === 'TEXT') {
      const { minLength, maxLength } = field.validation;
      if (typeof minLength === 'number' && typeof maxLength === 'number' && maxLength < minLength) {
        return 'Max length must be greater than or equal to min length.';
      }
    }

    return null;
  });
}

interface TemplateFieldEditorProps {
  fields: EditableField[];
  onChange: (fields: EditableField[]) => void;
}

export const TemplateFieldEditor: React.FC<TemplateFieldEditorProps> = ({ fields, onChange }) => {
  const errors = validateFields(fields);

  const updateField = (index: number, update: Partial<EditableField>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...update } : f)));
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const temp = next[index]!;
    next[index] = next[target]!;
    next[target] = temp;
    onChange(next);
  };

  const addField = () => {
    onChange([...fields, emptyField()]);
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const error = errors[index];
        return (
          <Card key={index} className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => moveField(index, -1)}
                  disabled={index === 0}
                  className="text-ink-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Move field up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(index, 1)}
                  disabled={index === fields.length - 1}
                  className="text-ink-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Move field down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Key</Label>
                  <Input
                    value={field.key}
                    onChange={(e) => updateField(index, { key: e.target.value })}
                    placeholder="e.g. guest-count"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Label</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateField(index, { label: e.target.value })}
                    placeholder="e.g. Guest count"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(value) =>
                      updateField(index, {
                        type: value as CategoryTemplateFieldType,
                        options: [],
                        validation: {},
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Checkbox
                    id={`required-${index}`}
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(index, { required: checked === true })
                    }
                  />
                  <Label htmlFor={`required-${index}`} className="text-xs">
                    Required
                  </Label>
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeField(index)}
                className="text-ink-muted hover:text-destructive cursor-pointer pt-1"
                aria-label="Remove field"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {OPTIONS_TYPES.includes(field.type) && (
              <div className="space-y-2 pl-6">
                <Label className="text-[11px]">Options</Label>
                {field.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <Input
                      value={option}
                      onChange={(e) => {
                        const nextOptions = [...field.options];
                        nextOptions[optionIndex] = e.target.value;
                        updateField(index, { options: nextOptions });
                      }}
                      placeholder="Option value"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        updateField(index, {
                          options: field.options.filter((_, i) => i !== optionIndex),
                        })
                      }
                      className="text-ink-muted hover:text-destructive cursor-pointer"
                      aria-label="Remove option"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={Plus}
                  onClick={() => updateField(index, { options: [...field.options, ''] })}
                >
                  Add option
                </Button>
              </div>
            )}

            {field.type === 'NUMBER' && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-[11px]">Min</Label>
                  <Input
                    type="number"
                    value={field.validation.min ?? ''}
                    onChange={(e) =>
                      updateField(index, {
                        validation: {
                          ...field.validation,
                          min: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Max</Label>
                  <Input
                    type="number"
                    value={field.validation.max ?? ''}
                    onChange={(e) =>
                      updateField(index, {
                        validation: {
                          ...field.validation,
                          max: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}

            {field.type === 'TEXT' && (
              <div className="grid grid-cols-2 gap-3 pl-6">
                <div className="space-y-1">
                  <Label className="text-[11px]">Min length</Label>
                  <Input
                    type="number"
                    value={field.validation.minLength ?? ''}
                    onChange={(e) =>
                      updateField(index, {
                        validation: {
                          ...field.validation,
                          minLength: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Max length</Label>
                  <Input
                    type="number"
                    value={field.validation.maxLength ?? ''}
                    onChange={(e) =>
                      updateField(index, {
                        validation: {
                          ...field.validation,
                          maxLength: e.target.value === '' ? undefined : Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            )}

            {error && <p className="text-destructive text-[11px] pl-6">{error}</p>}
          </Card>
        );
      })}

      <Button type="button" variant="outline" icon={Plus} onClick={addField}>
        Add field
      </Button>
    </div>
  );
};
