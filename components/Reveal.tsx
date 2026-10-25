import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
};

/**
 * Le contenu reste dans le HTML, visible sans JavaScript.
 * L’ancienne animation (opacity 0 jusqu’à l’hydratation) laissait la page blanche.
 */
export function Reveal({ children, className }: RevealProps) {
  return <div className={className}>{children}</div>;
}
