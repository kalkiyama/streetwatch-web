import React from "react";

// Catches any render-time crash anywhere in the app and shows a friendly
// recovery screen instead of a blank white page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Visible in the browser console; a hosted error service can hook in here later.
    console.error("StreetWatch crashed:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0E1116", color: "#E8EAED", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>StreetWatch hit a glitch</div>
          <div style={{ fontSize: 14, color: "#9AA0A6", marginBottom: 20 }}>
            Something went wrong while rendering. Your data is fine — reloading usually fixes it.
          </div>
          <button onClick={() => window.location.reload()}
            style={{ padding: "10px 22px", borderRadius: 8, border: "1px solid #2A2F3A",
              background: "#F6A821", color: "#0E1116", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
