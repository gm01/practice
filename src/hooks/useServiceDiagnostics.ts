import { useEffect, useState } from "react";
import { setRelatedRequestId } from "../telemetry";

export function useServiceDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({ requestId: null, serverVersion: null, apiVersion: null });
  useEffect(() => window.fcOnline.onDiagnostics(value => {
    setDiagnostics(value);
    setRelatedRequestId(value.requestId);
  }), []);
  return diagnostics;
}
