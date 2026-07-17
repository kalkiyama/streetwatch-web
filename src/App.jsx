import StreetWatch from "./StreetWatch.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
export default function App() {
  return (
    <ErrorBoundary>
      <StreetWatch />
    </ErrorBoundary>
  );
}
