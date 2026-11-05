"use client";

import Link from "next/link";
import { useEffect, useId, useRef, type CSSProperties, type Ref } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/crm/icons";
import { accountTabDirection, type AccountMotion } from "@/lib/crm/account-motion";
import { useFixedMenu } from "@/lib/crm/use-fixed-menu";
import { SIGN_OUT_LABEL } from "@/lib/crm/user-menu";

const panelClass =
  "fixed z-[80] w-64 overflow-y-auto rounded-2xl border border-[#e5e3dc] bg-white text-[var(--admin-navy)] shadow-[0_18px_50px_rgba(11,25,44,0.18)] max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)]";

/** Menu du compte client : Mon compte et Se déconnecter, visible aussi sur téléphone. */
export function AccountMenuPanel({
  id,
  href,
  transition,
  onClose,
  onSignOut,
  menuRef,
  firstItemRef,
  style,
}: {
  id: string;
  href: string;
  transition: AccountMotion;
  onClose: () => void;
  onSignOut: () => void | Promise<void>;
  menuRef?: Ref<HTMLDivElement>;
  firstItemRef?: Ref<HTMLAnchorElement>;
  style?: CSSProperties;
}) {
  return (
    <div ref={menuRef} id={id} role="menu" aria-label="Menu du compte" style={style} className={panelClass}>
      <Link
        ref={firstItemRef}
        role="menuitem"
        href={href}
        transitionTypes={[transition]}
        onClick={onClose}
        className="account-press flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <Icon name="badge" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        Mon compte
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onClose();
          void onSignOut();
        }}
        className="account-press flex w-full items-center gap-2 border-t border-[#e5e3dc] px-4 py-3 text-left text-sm font-medium hover:bg-[var(--surface-2)]"
      >
        <Icon name="logout" className="h-4 w-4 text-[var(--admin-gold-dark)]" />
        {SIGN_OUT_LABEL}
      </button>
    </div>
  );
}

export function AccountUserMenu({
  customerName,
  initials,
  href,
  basePath,
  preview = false,
  onSignOut,
}: {
  customerName: string;
  initials: string;
  href: string;
  basePath: string;
  /** Aperçu sans session : l’avatar ouvre le profil, sans déconnexion. */
  preview?: boolean;
  onSignOut: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menu = useFixedMenu("right", buttonRef, rootRef, menuRef);
  const firstItemRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!menu.open) return;
    const timer = window.setTimeout(() => firstItemRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [menu.open]);

  const avatarClass =
    "account-press relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--admin-navy)] text-[11px] font-bold text-white ring-1 ring-[var(--admin-gold)]/40";
  const dot = (
    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[var(--admin-gold)] ring-2 ring-[var(--background)]" />
  );

  if (preview) {
    return (
      <Link
        href={href}
        transitionTypes={[accountTabDirection(pathname, href, basePath)]}
        className={avatarClass}
        aria-label={`Compte ${customerName}`}
      >
        {initials}
        {dot}
      </Link>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={`${id}-menu`}
        aria-label={customerName ? `Menu de ${customerName}` : "Menu du compte"}
        onClick={menu.toggle}
        className={avatarClass}
      >
        {initials}
        {dot}
      </button>
      {menu.open && menu.mounted && menu.box
        ? createPortal(
            <AccountMenuPanel
              id={`${id}-menu`}
              href={href}
              transition={accountTabDirection(pathname, href, basePath)}
              onClose={() => menu.setOpen(false)}
              onSignOut={onSignOut}
              menuRef={menuRef}
              firstItemRef={firstItemRef}
              style={{ top: menu.box.top, left: menu.box.left, width: menu.box.width }}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
