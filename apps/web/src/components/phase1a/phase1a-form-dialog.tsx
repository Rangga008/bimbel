"use client";

import { useState, type FormEvent, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import {
  FormField,
  FieldValidIcon,
  SubmitButton,
} from '@/components/shared/form-field';
import { ComboboxField } from '@/components/shared/combobox-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface Phase1aField {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: number;
  hint?: string;
}

function invalidMessage(field: Phase1aField, validity: ValidityState): string {
  if (validity.valueMissing) return `${field.label} wajib diisi.`;
  if (validity.rangeUnderflow && field.min != null) return `Minimal ${field.min}.`;
  if (validity.typeMismatch) return 'Format isian belum valid.';
  return 'Periksa kembali isian ini.';
}

/** Form dialog generik Fase 1a (create/edit) — controlled oleh parent. */
export function Phase1aFormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  values,
  onChange,
  onSubmit,
  isSubmitting,
  submitLabel = 'Simpan',
  extra,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: Phase1aField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /** Slot tambahan di bawah fields (mis. dropdown custom) — tetap dalam <form>. */
  extra?: ReactNode;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  // Validasi native tetap berjalan — handler ini hanya menampilkan pesan inline
  // (menggantikan bubble browser), logic validasi bisnis tidak berubah.
  function handleInvalid(e: FormEvent) {
    const el = e.target as HTMLInputElement;
    const field = fields.find((f) => f.name === el.name);
    if (!field) return;
    e.preventDefault();
    setErrors((prev) => ({ ...prev, [field.name]: invalidMessage(field, el.validity) }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit} onInvalid={handleInvalid}>
          {fields.map((field) => {
            const value = values[field.name] ?? '';
            const error = errors[field.name];
            const valid = field.required === true && value.trim() !== '' && !error;
            return (
              <FormField
                key={field.name}
                htmlFor={`fase1a-${field.name}`}
                label={field.label}
                required={field.required}
                error={error}
                hint={field.hint}
              >
                <div className="relative">
                  <Input
                    id={`fase1a-${field.name}`}
                    name={field.name}
                    type={field.type ?? 'text'}
                    placeholder={field.placeholder}
                    required={field.required}
                    min={field.min}
                    aria-invalid={error ? true : undefined}
                    className={valid ? 'pr-9' : undefined}
                    value={value}
                    onChange={(e) => {
                      onChange(field.name, e.target.value);
                      if (error) setErrors((prev) => ({ ...prev, [field.name]: '' }));
                    }}
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                    <FieldValidIcon show={valid} />
                  </div>
                </div>
              </FormField>
            );
          })}
          {extra}
          <DialogFooter>
            <SubmitButton loading={isSubmitting}>{submitLabel}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Dropdown searchable — ketik untuk memfilter opsi, Enter/klik untuk memilih.
 * Dipakai di filter bar maupun form; nilai terpilih tetap `value` (id) yang sama.
 */
export function Phase1aSelectField(props: {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  emptyText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  hint?: string;
}) {
  return <ComboboxField {...props} />;
}
