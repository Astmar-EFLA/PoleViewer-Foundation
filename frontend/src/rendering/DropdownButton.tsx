import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

interface DropdownButtonProps {
  readonly label: string;
  readonly children: ReactNode;
  readonly width?: number;
  readonly maxHeight?: string;
}

const buttonStyle: CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 4,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
  fontFamily: "system-ui, sans-serif",
  whiteSpace: "nowrap",
};

/**
 * A toolbar button that reveals its content as a dropdown below itself,
 * closing on an outside click -- the shared building block behind
 * `Toolbar.tsx`. Every panel's content used to be its own permanently
 * visible floating box; wrapping each one in this instead means only the
 * button row is on screen by default, and opening one panel doesn't
 * require the others to get out of the way (each dropdown is independent,
 * not mutually exclusive, since a user may want two open side by side --
 * e.g. Foundations while checking Excavations).
 */
export function DropdownButton({ label, children, width = 300, maxHeight = "70vh" }: DropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          ...buttonStyle,
          border: open ? "1px solid #3070e0" : buttonStyle.border,
          background: open ? "#e8f0ff" : buttonStyle.background,
        }}
      >
        {label} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "rgba(255,255,255,0.97)",
            borderRadius: 6,
            padding: "10px 12px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
            width,
            maxHeight,
            overflowY: "auto",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            zIndex: 40,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
