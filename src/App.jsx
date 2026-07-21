import StreetWatch from "./StreetWatch.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
// Vercel Web Analytics — cookieless, anonymous. The official React component (their
// recommended path for Vite apps) replaces the manual script tag so nothing double-counts.
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <ErrorBoundary>
      <StreetWatch />
      <Analytics />
    </ErrorBoundary>
  );
}
