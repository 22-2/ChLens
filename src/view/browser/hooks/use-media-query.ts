import { useEffect, useState } from "react";

function readMatchMedia(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/** Mantineへ依存せず、ブラウザのmedia query状態を購読する小さなhook。 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMatchMedia(query));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
