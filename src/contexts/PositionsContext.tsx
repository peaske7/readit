import { createContext, type ReactNode, use, useRef } from "react";
import { Positions } from "../lib/positions";

const Ctx = createContext<Positions | null>(null);

export function usePositions(): Positions {
  const value = use(Ctx);
  if (!value) throw new Error("usePositions requires PositionsProvider");
  return value;
}

export function PositionsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Positions | null>(null);
  if (!ref.current) ref.current = new Positions();
  return <Ctx value={ref.current}>{children}</Ctx>;
}
