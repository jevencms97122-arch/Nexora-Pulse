import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const spring = { type: "spring", stiffness: 420, damping: 36, mass: 0.9 } as const;
export const softSpring = { type: "spring", stiffness: 260, damping: 30 } as const;

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "bg-surface-2 text-fg hover:bg-surface-3",
  ghost: "text-accent hover:bg-accent-soft",
  danger: "bg-[color-mix(in_srgb,var(--red)_14%,transparent)] text-[var(--red)] hover:bg-[color-mix(in_srgb,var(--red)_22%,transparent)]",
};

export function Button({ variant = "primary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-[background,transform,opacity] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-2 text-muted transition hover:bg-surface-3 hover:text-fg active:scale-95 ${className}`}
    >
      {children}
    </button>
  );
}

export function Badge({ color, children }: { color?: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap"
      style={
        color
          ? { color, background: `color-mix(in srgb, ${color} 13%, transparent)` }
          : { color: "var(--muted)", background: "var(--surface-2)" }
      }
    >
      {children}
    </span>
  );
}

export function StatusDot({ color, live = false, size = 9 }: { color: string; live?: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {live && <span className="dot-ring absolute inset-0 rounded-full" style={{ background: color }} />}
      <span className="relative rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const group = useId();
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-[11px] bg-surface-3/70 p-[3px]">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`relative h-7 rounded-lg px-3.5 text-[12.5px] font-medium whitespace-nowrap transition-colors ${active ? "text-fg" : "text-muted hover:text-fg"}`}
          >
            {active && <motion.span layoutId={`seg-${group}`} transition={spring} className="absolute inset-0 rounded-lg bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.16)]" />}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200"
      style={{ background: checked ? "var(--green)" : "var(--surface-3)" }}
    >
      <motion.span
        animate={{ x: checked ? 20 : 2 }}
        transition={spring}
        className="absolute top-[2px] left-0 h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
      />
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-faint">{hint}</span>}
    </label>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="t-eyebrow mb-1">{eyebrow}</p>}
        <h1 className="t-large truncate">{title}</h1>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between px-1">
      <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
      {action}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="squircle mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-surface-2 text-faint">{icon}</div>
      <h3 className="t-headline">{title}</h3>
      <p className="mt-1 max-w-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  width = 620,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-8 backdrop-blur-[6px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="squircle flex max-h-full w-full flex-col overflow-hidden rounded-[26px] bg-surface shadow-[var(--shadow-sheet)]"
            style={{ maxWidth: width }}
            initial={reduced ? false : { opacity: 0, y: 26, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            transition={softSpring}
          >
            {title ? (
              <div className="flex shrink-0 items-center justify-between px-6 pt-5 pb-3">
                <h2 className="t-title !text-[20px]">{title}</h2>
                <IconButton label="Fermer" onClick={onClose}>
                  <X size={15} strokeWidth={2.6} />
                </IconButton>
              </div>
            ) : null}
            <div className="scroll min-h-0 flex-1">{children}</div>
            {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const text = useTransform(motionValue, (v) => Math.round(v).toString());
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { type: "spring", stiffness: 90, damping: 20 });
    return () => controls.stop();
  }, [value, motionValue, reduced]);
  return <motion.span>{text}</motion.span>;
}

export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...softSpring, delay }}>
      {children}
    </motion.div>
  );
}

export function Skeletons({ count = 3, height = 180 }: { count?: number; height?: number }) {
  return (
    <div className="grid grid-cols-3 gap-5" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}
