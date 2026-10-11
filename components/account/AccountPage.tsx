/// <reference types="react/canary" />
import { ViewTransition, type ReactNode } from "react";

const SLIDE = {
  "nav-forward": "account-nav-forward",
  "nav-back": "account-nav-back",
  "nav-fade": "account-nav-fade",
  default: "none",
} as const;

/**
 * Contenu d’une page de l’espace client. Le layout (en-tête, barre) ne passe pas ici :
 * il reste fixe pendant que ce bloc glisse ou fond.
 */
export function AccountPage({
  children,
  motion = "slide",
}: {
  children: ReactNode;
  /** `fade` : même endroit (profil). `skeleton` : le squelette s’efface à l’arrivée. */
  motion?: "slide" | "fade" | "skeleton";
}) {
  if (motion === "skeleton") {
    return (
      <ViewTransition
        enter={{
          "nav-forward": "account-nav-forward",
          "nav-back": "account-nav-back",
          "nav-fade": "account-nav-fade",
          default: "none",
        }}
        exit="account-skel-out"
        default="none"
      >
        <div>{children}</div>
      </ViewTransition>
    );
  }

  if (motion === "fade") {
    return (
      <ViewTransition
        enter={{ "nav-fade": "account-nav-fade", default: "none" }}
        exit={{ "nav-fade": "account-nav-fade", default: "none" }}
        default="none"
      >
        <div>{children}</div>
      </ViewTransition>
    );
  }

  return (
    <ViewTransition enter={SLIDE} exit={SLIDE} default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
