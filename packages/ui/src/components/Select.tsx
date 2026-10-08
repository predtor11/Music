import { useId, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/** Native select (good keyboard and screen-reader support), styled to match. */
export function Select({
  label,
  options,
  groups,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options?: readonly SelectOption[];
  groups?: ReadonlyArray<{ label: string; options: readonly SelectOption[] }>;
}) {
  const id = useId();
  return (
    <label className="ui-field" htmlFor={id}>
      <span className="ui-field-label">{label}</span>
      <select id={id} className="ui-select" {...rest}>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
