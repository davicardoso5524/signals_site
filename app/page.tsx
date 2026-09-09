import Image from "next/image";
import { existsSync } from "node:fs";
import path from "node:path";
import Hero from "./components/Hero";

const DOWNLOAD_URL = "https://github.com/davicardoso5524/signals/releases";
const GITHUB_URL = "https://github.com/davicardoso5524/signals";
const hasWebm = existsSync(path.join(process.cwd(), "public", "signals-background.webm"));
const hasMp4 = existsSync(path.join(process.cwd(), "public", "signals-background.mp4"));

const steps = [
  {
    number: "01",
    title: "Create or join a room",
    description: "Start a temporary room or keep one around for later.",
  },
  {
    number: "02",
    title: "Talk and share",
    description: "Start a voice call and share your screen when needed.",
  },
  {
    number: "03",
    title: "Stay connected",
    description: "Persistent rooms keep people and conversations together.",
  },
];

const capabilities = [
  ["Voice calls", "Talk without creating a complicated server structure."],
  ["Screen sharing", "Share what you are working on when words are not enough."],
  ["Persistent rooms", "Create spaces that stay available without channel trees."],
  ["Chat", "Keep the conversation with the room."],
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Signals home">
          <Image src="/signals-icon.png" alt="" width={27} height={27} priority />
          <span>SIGNALS</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#about">About</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a className="nav-download" href="#download">Download</a>
        </nav>
      </header>

      <div id="top">
        <Hero
          downloadUrl={DOWNLOAD_URL}
          githubUrl={GITHUB_URL}
          hasWebm={hasWebm}
          hasMp4={hasMp4}
        />
      </div>

      <div className="page-shell">
        <section className="preview-section" aria-labelledby="preview-title">
          <div className="section-kicker" id="preview-title">The desktop app</div>
          <div className="preview-frame">
            <Image
              src="/app-preview.png"
              alt="Signals desktop app showing a persistent room and its chat"
              width={1280}
              height={720}
              sizes="(max-width: 900px) 100vw, 1120px"
              priority
            />
          </div>
        </section>

        <section id="about" className="about section-rule" aria-labelledby="about-title">
          <div className="section-label">About</div>
          <div>
            <h2 id="about-title">What is Signals?</h2>
            <p className="large-copy">
              Signals is a focused desktop communication app for people who just want to talk, share their screen and keep conversations together.
            </p>
            <p className="muted-copy">No servers full of channels. No unnecessary layers. Just people, rooms and communication.</p>
          </div>
        </section>

        <section className="how section-rule" aria-labelledby="how-title">
          <div className="section-label">How it works</div>
          <div>
            <h2 id="how-title" className="sr-only">How it works</h2>
            <div className="steps">
              {steps.map((step) => (
                <article className="step" key={step.number}>
                  <span className="step-number">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="capabilities section-rule" aria-labelledby="capabilities-title">
          <div className="section-label">Core capabilities</div>
          <div>
            <h2 id="capabilities-title" className="sr-only">Core capabilities</h2>
            <div className="capability-list">
              {capabilities.map(([title, description]) => (
                <article className="capability" key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="focus section-rule" aria-labelledby="focus-title">
          <p className="eyebrow">The idea</p>
          <h2 id="focus-title">Built for focus.</h2>
          <p className="focus-lines">No servers.<br />No channel trees.<br />No clutter.</p>
          <p className="focus-end">Just people, rooms and communication.</p>
        </section>

        <section id="download" className="download section-rule" aria-labelledby="download-title">
          <div>
            <p className="eyebrow">Get Signals</p>
            <h2 id="download-title">Download Signals</h2>
            <p className="muted-copy">Available for Windows.</p>
          </div>
          <div className="download-action">
            <a className="button button-primary" href={DOWNLOAD_URL} target="_blank" rel="noreferrer">
              Download for Windows <span aria-hidden="true">↗</span>
            </a>
            <span className="version">Latest release on GitHub · Windows 10/11 · 64-bit</span>
          </div>
        </section>
      </div>

      <footer className="site-footer">
        <span>SIGNALS</span>
        <div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          <a href="#top">Back to top</a>
        </div>
        <span>© 2026 Signals</span>
      </footer>
    </main>
  );
}
