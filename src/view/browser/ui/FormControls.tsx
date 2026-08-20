import { Checkbox as RadixCheckbox, RadioGroup as RadixRadioGroup } from "radix-ui";
import type { ChangeEvent, HTMLAttributes, ReactNode } from "react";

interface FieldShellProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  label: string;
  description?: string;
  htmlFor?: string;
}

function FieldShell({
  label,
  description,
  htmlFor,
  className,
  children,
  ...props
}: FieldShellProps) {
  const classes = ["browser-field", className].filter(Boolean).join(" ");

  return (
    <div {...props} className={classes}>
      <label className="browser-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {description ? <p className="browser-field__description">{description}</p> : null}
      {children}
    </div>
  );
}

interface TextareaFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  rows?: number;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
}

export function TextareaField({
  id,
  label,
  description,
  value,
  rows = 2,
  onChange,
}: TextareaFieldProps) {
  return (
    <FieldShell htmlFor={id} label={label} description={description}>
      <textarea id={id} rows={rows} value={value} onChange={onChange} />
    </FieldShell>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  description?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}

export function NumberField({
  id,
  label,
  description,
  value,
  min,
  max,
  step,
  onChange,
}: NumberFieldProps) {
  return (
    <FieldShell htmlFor={id} label={label} description={description}>
      <input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value);
          onChange(Number.isFinite(nextValue) ? nextValue : 0);
        }}
      />
    </FieldShell>
  );
}

interface CheckboxFieldProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function CheckboxField({
  id,
  label,
  description,
  checked,
  onCheckedChange,
}: CheckboxFieldProps) {
  return (
    <div className="browser-field browser-field--checkbox">
      <div className="browser-checkbox-field">
        <RadixCheckbox.Root
          id={id}
          checked={checked}
          className="browser-checkbox-field__control"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        >
          <RadixCheckbox.Indicator className="browser-checkbox-field__indicator">
            ✓
          </RadixCheckbox.Indicator>
        </RadixCheckbox.Root>
        <label className="browser-checkbox-field__label" htmlFor={id}>
          {label}
        </label>
      </div>
      {description ? <p className="browser-field__description">{description}</p> : null}
    </div>
  );
}

export interface RadioFieldOption {
  const: string;
  title: string;
}

interface RadioFieldProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  options: readonly RadioFieldOption[];
  onValueChange: (value: string) => void;
}

export function RadioField({
  id,
  label,
  description,
  value,
  options,
  onValueChange,
}: RadioFieldProps) {
  return (
    <fieldset className="browser-field browser-radio-field">
      <legend className="browser-field__label">{label}</legend>
      {description ? <p className="browser-field__description">{description}</p> : null}
      <RadixRadioGroup.Root
        aria-label={label}
        className="browser-radio-field__group"
        value={value}
        onValueChange={onValueChange}
      >
        {options.map((option) => {
          const optionId = `${id}-${option.const}`;
          return (
            <label key={option.const} className="browser-radio-field__option" htmlFor={optionId}>
              <RadixRadioGroup.Item
                id={optionId}
                value={option.const}
                className="browser-radio-field__control"
              >
                <RadixRadioGroup.Indicator className="browser-radio-field__indicator" />
              </RadixRadioGroup.Item>
              <span>{option.title}</span>
            </label>
          );
        })}
      </RadixRadioGroup.Root>
    </fieldset>
  );
}

export interface FieldDescriptionProps {
  children: ReactNode;
}

export function FieldDescription({ children }: FieldDescriptionProps) {
  return <p className="browser-field__description">{children}</p>;
}
