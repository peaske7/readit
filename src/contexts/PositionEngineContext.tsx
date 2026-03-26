import { createContext, type ReactNode, use, useRef } from "react";
import { PositionEngine } from "../lib/position-engine";

const PositionEngineContext = createContext<PositionEngine | null>(null);

export function usePositionEngine(): PositionEngine {
  const engine = use(PositionEngineContext);
  if (!engine) {
    throw new Error(
      "usePositionEngine must be used within a PositionEngineProvider",
    );
  }
  return engine;
}

interface PositionEngineProviderProps {
  children: ReactNode;
}

export function PositionEngineProvider({
  children,
}: PositionEngineProviderProps) {
  // Stable singleton per mount — never changes, never causes re-renders
  const engineRef = useRef<PositionEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new PositionEngine();
  }

  return (
    <PositionEngineContext value={engineRef.current}>
      {children}
    </PositionEngineContext>
  );
}
