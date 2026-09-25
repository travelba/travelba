"use client";

import { useEffect } from "react";

function rewrite(url: string) {
  if (url.startsWith("/api/client/")) return `/api/exemple/${url.slice("/api/client/".length)}`;
  return url;
}

/** Sur /exemple, les gestes client restent dans le processus local. */
export function ExampleFetchBridge({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string") return original(rewrite(input), init);
      if (input instanceof URL) return original(rewrite(input.pathname + input.search), init);
      const next = rewrite(input.url);
      if (next === input.url) return original(input, init);
      return original(new Request(next, input), init);
    };
    return () => {
      window.fetch = original;
    };
  }, []);
  return children;
}
