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
//
// `key` is still exactly what the backend contract requires — sent as-is
// in the create payload — but is never shown or hand-edited by an admin.
// `keyLocked` says where it came from: true for a field prefilled from an
// already-saved version (its key must never change, since existing Jobs'
// categoryData is keyed by it), false for a field added this session,
// whose key is continuously derived from `label` as the admin types.
export interface EditableField {
  key: string;
  keyLocked: boolean;
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
  return {
    key: '',
    keyLocked: false,
    label: '',
    type: 'TEXT',
    required: false,
    options: [],
    validation: {},
  };
}

// e.g. "Current wall condition" -> "current-wall-condition". Matches the
// backend's own key pattern by construction — lowercase words joined by
// single hyphens, nothing else survives.
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Appends -2, -3, ... until the slug doesn't collide with another field's
// key already in the template. An empty base (nothing sluggable in the
// requirement text yet) is returned as-is — validateFields below reports
// that as "Requirement is required," not a duplicate.
function uniqueKey(base: string, existingKeys: string[]): string {
  if (!base || !existingKeys.includes(base)) return base;
  let suffix = 2;
  while (existingKeys.includes(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

// One error string per field index, or null when that field is valid.
// Exported so the parent page can gate the submit button on it without
// re-deriving the same rules. Same underlying rules as before (a valid,
// unique, non-empty key is still required) — only the wording changed,
// since the admin never sees "key" as a concept, only "Requirement".
export function validateFields(fields: EditableField[]): (string | null)[] {
  const keyCounts = new Map<string, number>();
  for (const field of fields) {
    keyCounts.set(field.key, (keyCounts.get(field.key) ?? 0) + 1);
  }

  return fields.map((field) => {
    if (!field.label.trim()) return 'Requirement is required.';
    if (!field.key.trim() || !KEY_PATTERN.test(field.key)) {
      return "This requirement's wording couldn't be turned into a valid identifier — try rephrasing it.";
    }
    if ((keyCounts.get(field.key) ?? 0) > 1) {
      return 'This requirement collides with another one — try more distinct wording.';
    }

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
  /** Forwarded to each field's "Answer type" SelectContent — see its own
   * `container` prop comment for why this exists (this editor always
   * renders inside a Modal, whose portal already needs the same fix). */
  selectContainer?: HTMLElement | null;
}

export const TemplateFieldEditor: React.FC<TemplateFieldEditorProps> = ({
  fields,
  onChange,
  selectContainer,
}) => {
  const errors = validateFields(fields);

  // Stable, content-independent identities for React `key`s only — never
  // sent to the backend, never read from `fields` itself. Index-based keys
  // broke here because `moveField`/`removeField` and the option add/remove
  // handlers below all splice/reorder `fields` (and `field.options`) by
  // index, which is exactly the case where a key derived from that same
  // index misattributes DOM/focus state across rows. Lazily seeded from
  // the array this component was mounted with (the parent always mounts a
  // fresh editor per template — see Modal/Dialog — so this never needs to
  // reconcile against an externally-swapped `fields` array), then kept in
  // lockstep with every mutation below.
  const [fieldIds, setFieldIds] = React.useState<string[]>(() =>
    fields.map(() => crypto.randomUUID()),
  );
  const [optionIds, setOptionIds] = React.useState<string[][]>(() =>
    fields.map((f) => f.options.map(() => crypto.randomUUID())),
  );

  const updateField = (index: number, update: Partial<EditableField>) => {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...update } : f)));
  };

  // The only place `key` is ever written from the UI. A locked field (one
  // prefilled from an already-saved version) only has its label updated —
  // its key is untouchable here, on purpose. A new field's key is
  // re-derived from the requirement text on every keystroke and kept
  // unique against every other field's *current* key, so two fields
  // titled the same way don't silently collide.
  const updateRequirement = (index: number, label: string) => {
    const field = fields[index]!;
    if (field.keyLocked) {
      updateField(index, { label });
      return;
    }
    const otherKeys = fields.filter((_, i) => i !== index).map((f) => f.key);
    const key = uniqueKey(slugify(label), otherKeys);
    onChange(fields.map((f, i) => (i === index ? { ...f, label, key } : f)));
  };

  const removeField = (index: number) => {
    setFieldIds((ids) => ids.filter((_, i) => i !== index));
    setOptionIds((ids) => ids.filter((_, i) => i !== index));
    onChange(fields.filter((_, i) => i !== index));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    const temp = next[index]!;
    next[index] = next[target]!;
    next[target] = temp;

    const swap = <T,>(arr: T[]): T[] => {
      const copy = [...arr];
      const tempItem = copy[index]!;
      copy[index] = copy[target]!;
      copy[target] = tempItem;
      return copy;
    };
    setFieldIds(swap);
    setOptionIds(swap);

    onChange(next);
  };

  const addField = () => {
    setFieldIds((ids) => [...ids, crypto.randomUUID()]);
    setOptionIds((ids) => [...ids, []]);
    onChange([...fields, emptyField()]);
  };

  return (
    <div className="space-y-3">
      {fields.map((field, index) => {
        const error = errors[index];
        return (
          <Card key={fieldIds[index]} className="p-4 space-y-3">
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

              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Requirement</Label>
                  <Input
                    value={field.label}
                    onChange={(e) => updateRequirement(index, e.target.value)}
                    placeholder="e.g. Guest count"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Answer type</Label>
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
                      <SelectContent container={selectContainer}>
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
                  <div key={optionIds[index]![optionIndex]} className="flex items-center gap-2">
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
                      onClick={() => {
                        setOptionIds((ids) =>
                          ids.map((fieldOptionIds, i) =>
                            i === index
                              ? fieldOptionIds.filter((_, oi) => oi !== optionIndex)
                              : fieldOptionIds,
                          ),
                        );
                        updateField(index, {
                          options: field.options.filter((_, i) => i !== optionIndex),
                        });
                      }}
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
                  onClick={() => {
                    setOptionIds((ids) =>
                      ids.map((fieldOptionIds, i) =>
                        i === index ? [...fieldOptionIds, crypto.randomUUID()] : fieldOptionIds,
                      ),
                    );
                    updateField(index, { options: [...field.options, ''] });
                  }}
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
