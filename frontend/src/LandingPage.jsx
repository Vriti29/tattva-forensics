import { useState } from "react";
import "./LandingPage.css";

const features = {
  timeline: {
    title: "Timeline Reconstruction",
    text: "Arrange digital events chronologically to understand the sequence of activities during an investigation.",
    icon: "◷",
  },
  correlation: {
    title: "Evidence Correlation",
    text: "Explore relationships between evidence items and identify connections that deserve closer examination.",
    icon: "⌘",
  },
  anomaly: {
    title: "Anomaly Detection",
    text: "Review unusual patterns and system-generated anomaly indicators with their supporting evidence.",
    icon: "⌕",
  },
  reports: {
    title: "Forensic Reports",
    text: "Review investigation findings, anomalies, correlations, and evidence references in structured reports.",
    icon: "▤",
  },
  privacy: {
    title: "Private by Design",
    text: "Keep investigation workflows structured and accessible through the platform's authentication system.",
    icon: "♢",
  },
  access: {
    title: "Role-based Access",
    text: "Use the platform's investigator and administrator roles to manage access to investigation features.",
    icon: "♙",
  },
  ready: {
    title: "Investigation Ready",
    text: "Bring evidence review, correlation, timelines, and reporting into one investigation workspace.",
    icon: "▱",
  },
};

export function LandingPage({ onSignIn }) {
  const [activeInfo, setActiveInfo] = useState(null);

  const openInfo = (key) => setActiveInfo(features[key]);

  return (
    <main className="landing-screen">
      <header className="landing-header">
        <a className="landing-brand" href="#" aria-label="Tattva Forensics home">
          <span className="brand-mark">T</span>
          <span className="brand-name">
            TATTVA
            <small>FORENSICS</small>
          </span>
        </a>

        <span className="header-divider" />

        <nav className="landing-nav">
          <button onClick={() => openInfo("correlation")}>Platform</button>
          <button onClick={() => openInfo("anomaly")}>Capabilities</button>
          <button onClick={() => openInfo("timeline")}>Our Method</button>
        </nav>

        <button className="signin-button" onClick={onSignIn}>
          Sign in <span>↗</span>
        </button>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <div className="hero-eyebrow">
            <span />
            DIGITAL FORENSICS · EVIDENCE INTELLIGENCE
          </div>

          <h1>
            Every piece of
            <br />
            evidence has a
            <br />
            <em>connection.</em>
          </h1>

          <div className="hero-underline" />

          <h2>Look Beyond the Alert.</h2>

          <p className="hero-description">
            Bring digital evidence together, uncover meaningful
            relationships, and reconstruct the sequence of events
            with clarity and confidence.
          </p>

          <div className="hero-buttons">
            <button className="explore-button" onClick={onSignIn}>
              Explore the platform <span>→</span>
            </button>

            <button
              className="discover-button"
              onClick={() => openInfo("ready")}
            >
              Discover how it works
              <span className="play-icon">▶</span>
            </button>
          </div>

          <div className="hero-trust">
            <button onClick={() => openInfo("privacy")}>
              <span>♢</span> Private by Design
            </button>

            <i />

            <button onClick={() => openInfo("access")}>
              <span>♙</span> Role-based Access
            </button>

            <i />

            <button onClick={() => openInfo("ready")}>
              <span>▱</span> Investigation Ready
            </button>
          </div>
        </div>

        <div className="hero-art">
          <div className="art-backdrop" />

          <div className="art-outline" />

          <img
            src="/forensics-hero.png"
            alt="Digital forensic investigation using a magnifying glass and laptop"
            className="forensics-photo"
          />

          <button
            className="floating-feature timeline-feature"
            onClick={() => openInfo("timeline")}
          >
            <span>▦</span>
            <strong>Timeline<br />Reconstruction</strong>
          </button>

          <button
            className="floating-feature correlation-feature"
            onClick={() => openInfo("correlation")}
          >
            <span>⌘</span>
            <strong>Evidence<br />Correlation</strong>
          </button>

          <button
            className="floating-feature anomaly-feature"
            onClick={() => openInfo("anomaly")}
          >
            <span>⌕</span>
            <strong>Anomaly<br />Detection</strong>
          </button>

          <button
            className="floating-feature reports-feature"
            onClick={() => openInfo("reports")}
          >
            <span>▤</span>
            <strong>Forensic<br />Reports</strong>
          </button>

          <span className="art-decoration decoration-one">✳</span>
          <span className="art-decoration decoration-two">✳</span>
        </div>
      </section>

      {activeInfo && (
        <div
          className="info-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveInfo(null);
            }
          }}
        >
          <section className="info-modal" role="dialog" aria-modal="true">
            <button
              className="modal-close"
              onClick={() => setActiveInfo(null)}
              aria-label="Close"
            >
              ×
            </button>

            <span className="modal-icon">{activeInfo.icon}</span>
            <span className="modal-kicker">TATTVA FORENSICS</span>
            <h2>{activeInfo.title}</h2>
            <p>{activeInfo.text}</p>

            <button
              className="modal-action"
              onClick={() => {
                setActiveInfo(null);
                onSignIn();
              }}
            >
              Enter the platform →
            </button>
          </section>
        </div>
      )}
    </main>
  );
}