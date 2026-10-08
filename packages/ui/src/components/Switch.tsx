import { motion } from 'motion/react';
import { spring } from '../motion.js';

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="ui-switch" data-on={checked} onClick={() => onChange(!checked)} style={{ background: 'none', border: 0, padding: 0 }}>
      <span className="ui-switch-track">
        <motion.span layout className="ui-switch-thumb" transition={spring.snappy} />
      </span>
      <span>{label}</span>
    </button>
  );
}
