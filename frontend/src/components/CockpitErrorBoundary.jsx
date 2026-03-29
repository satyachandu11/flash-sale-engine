import React from "react";

export default class CockpitErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown panel failure"
    };
  }

  componentDidCatch(error) {
    if (this.props.onError) this.props.onError(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="glass-panel flex h-full min-h-[18rem] flex-col justify-between p-6">
        <div>
          <p className="hud-label">Containment</p>
          <h3 className="mt-3 font-serif text-2xl text-white">Observability rail offline</h3>
          <p className="mt-3 max-w-sm text-sm text-slate-300">
            The simulation kept running, but one of the heavy monitoring panels threw an error. This boundary is isolating
            the failure instead of taking the whole cockpit down.
          </p>
        </div>
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {this.state.message}
        </div>
      </section>
    );
  }
}
