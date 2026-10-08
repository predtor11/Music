import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { spring } from '../motion.js';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

/** Pick one of a few options; the highlight slides to the chosen one. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="ui-segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`seg-${id}`} className="ui-segmented-pill" transition={spring.snappy} />}
            <span className="ui-segmented-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
