"use client";

import { useEffect, useRef } from "react";

/**
 * Full-viewport mouse-reactive glow. pointer-events: none so panels stay interactive.
 */
export function BackgroundAura() {
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLDivElement>(null);
  const target = useRef({ x: 0.5, y: 0.35 });
  const primary = useRef({ x: 0.5, y: 0.35 });
  const raf = useRef<number>(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      rootRef.current?.setAttribute("data-static", "true");
      return;
    }

    const onMove = (e: PointerEvent) => {
      target.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };

    const tick = () => {
      primary.current.x += (target.current.x - primary.current.x) * 0.12;
      primary.current.y += (target.current.y - primary.current.y) * 0.12;

      if (primaryRef.current) {
        primaryRef.current.style.left = `${primary.current.x * 100}%`;
        primaryRef.current.style.top = `${primary.current.y * 100}%`;
      }

      raf.current = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={rootRef} className="bg-aura" aria-hidden="true">
      <div ref={primaryRef} className="bg-aura__blob bg-aura__blob--a" />
      <div className="bg-aura__grain" />
    </div>
  );
}
