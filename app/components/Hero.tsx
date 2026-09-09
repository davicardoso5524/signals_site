"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type HeroProps = {
  downloadUrl: string;
  githubUrl: string;
  hasWebm: boolean;
  hasMp4: boolean;
};

export default function Hero({ downloadUrl, githubUrl, hasWebm, hasMp4 }: HeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!video) return;

    const syncMotionPreference = () => {
      if (motionQuery.matches) {
        video.pause();
      } else if (video.paused) {
        void video.play().catch(() => undefined);
      }
    };

    syncMotionPreference();
    motionQuery.addEventListener("change", syncMotionPreference);

    return () => motionQuery.removeEventListener("change", syncMotionPreference);
  }, []);

  return (
    <section className="hero" aria-labelledby="hero-title">
      {(hasWebm || hasMp4) && (
        <video
          ref={videoRef}
          className="hero-video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        >
          {hasWebm && <source src="/signals-background.webm" type="video/webm" />}
          {hasMp4 && <source src="/signals-background.mp4" type="video/mp4" />}
        </video>
      )}
      <div className="hero-overlay" aria-hidden="true" />
      <div className="hero-content">
        <p className="eyebrow">SIGNALS</p>
        <h1 id="hero-title">Communication,<br />without the clutter.</h1>
        <p className="hero-copy">
          Voice, screen sharing and persistent rooms<br className="desktop-break" /> in one focused desktop app.
        </p>
        <div className="hero-actions">
          <a className="button button-primary" href={downloadUrl} target="_blank" rel="noreferrer">
            Download for Windows <span aria-hidden="true">↗</span>
          </a>
          <a className="text-link" href={githubUrl} target="_blank" rel="noreferrer">
            View on GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
      <div className="scroll-indicator" aria-hidden="true">
        <span className="scroll-line" />
        <span>Scroll to explore</span>
      </div>
    </section>
  );
}
