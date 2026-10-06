/**
 * Substitut du paquet marqueur `server-only` pour `npm test`.
 * Next le traite à la compilation et ne l’installe pas ; Node, via tsx,
 * ne le trouve pas. Branché seulement par `tsconfig.test.json`.
 */
export {};
