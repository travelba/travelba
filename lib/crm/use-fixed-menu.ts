"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { useIsClient } from "@/lib/crm/use-is-client";
import { userMenuPosition } from "@/lib/crm/user-menu";

type MenuBox = { top: number; left: number; width: number };

/**
 * Ouvre un menu en `fixed`, mesuré depuis le bouton.
 * Les refs restent dans le composant : ce hook ne les renvoie pas.
 */
export function useFixedMenu(
  align: "left" | "right",
  buttonRef: RefObject<HTMLButtonElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<MenuBox | null>(null);
  const mounted = useIsClient();

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setBox(
        userMenuPosition(
          { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
          { width: window.innerWidth, height: window.innerHeight },
          align,
        ),
      );
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: Event) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    place();
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, { capture: true });
    };
  }, [open, align, buttonRef, rootRef, menuRef]);

  function toggle() {
    setOpen((value) => !value);
  }

  return { open, setOpen, toggle, mounted, box };
}
