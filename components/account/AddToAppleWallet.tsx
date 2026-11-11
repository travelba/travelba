/**
 * Badge « Ajouter à Apple Wallet ».
 * Le lien ouvre le fichier .pkpass déjà signé par la compagnie.
 */
export function AddToAppleWallet({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a href={href} className={`inline-flex w-full max-w-full ${className}`} aria-label="Ajouter à Apple Wallet">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 176 48" role="img" className="h-auto w-full max-w-[176px]">
        <title>Ajouter à Apple Wallet</title>
        <rect width="176" height="48" rx="7" fill="#000" />
        <path
          fill="#fff"
          d="M24.2 14.2c.8-1 1.3-2.3 1.2-3.7-1.2.1-2.6.8-3.4 1.8-.7.9-1.4 2.3-1.2 3.6 1.3.1 2.6-.6 3.4-1.7zm1.1 1.8c-1.9-.1-3.5 1.1-4.4 1.1-.9 0-2.3-1-3.8-1-2 0-3.8 1.1-4.8 2.9-2.1 3.6-.5 8.9 1.5 11.8 1 1.4 2.1 3 3.7 2.9 1.4-.1 2-.9 3.7-.9s2.2.9 3.8.9 2.5-1.5 3.5-2.9c1.1-1.6 1.6-3.1 1.6-3.2-.1 0-3-.1-3.1-4.3-.1-2.7 2.2-4 2.3-4.1-1.3-1.8-3.2-2-3.9-2.1z"
        />
        <text x="46" y="20" fill="#fff" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" fontSize="11">
          Ajouter à
        </text>
        <text
          x="46"
          y="36"
          fill="#fff"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontSize="16"
          fontWeight="600"
        >
          Apple Wallet
        </text>
      </svg>
    </a>
  );
}
