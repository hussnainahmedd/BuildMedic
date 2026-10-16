import { useState, type CSSProperties, type ReactNode } from "react";

import { Icon, type IconName } from "../components/icons";
import { type Navigate } from "../components/layout";
import {
  AppLink,
  Badge,
  Button,
  Card,
  DemoNotice,
  Divider,
  SectionHeading,
} from "../components/ui";
import { useTabKeyboard } from "../lib/tab-keyboard";

export interface PublicPageProps {
  onNavigate: Navigate;
  onOpenDemo: () => void;
  onNotify: (message: string) => void;
}

async function copyPublicText(text: string, onNotify: PublicPageProps["onNotify"], message: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("unavailable");
    await navigator.clipboard.writeText(text);
    onNotify(message);
  } catch {
    onNotify("Could not copy. Check clipboard permissions or select the text manually.");
  }
}

function PublicPageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="public-page-header">
      <div className="container public-page-header-inner">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
        {children ? <div className="public-page-header-actions">{children}</div> : null}
      </div>
    </section>
  );
}

function ArrowLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: Navigate }) {
  return (
    <AppLink className="arrow-link" onNavigate={onNavigate} to={href}>
      <span>{label}</span>
      <Icon name="arrow-right" size={15} />
    </AppLink>
  );
}

function HeroConsole({ onOpenDemo }: { onOpenDemo: () => void }) {
  const [activeTab, setActiveTab] = useState<"diagnosis" | "evidence">("diagnosis");
  const { tabProps, panelProps } = useTabKeyboard(["diagnosis", "evidence"] as const, activeTab, setActiveTab);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const style = {
    "--hero-x": `${tilt.x}deg`,
    "--hero-y": `${tilt.y}deg`,
  } as CSSProperties;

  return (
    <div
      className="hero-visual-wrap"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 3;
        const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -3;
        setTilt({ x, y });
      }}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
    >
      <div className="hero-glow hero-glow-one" />
      <div className="hero-glow hero-glow-two" />
      <div className="hero-console" style={style}>
        <div className="console-topbar">
          <div className="console-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="console-filename">sanitized-node-build.log</span>
          <Badge tone="accent" size="sm" dot>
            Demo run
          </Badge>
        </div>
        <div className="console-body">
          <div className="console-log">
            <div className="console-command">
              <span className="console-prompt">$</span> npm run build
            </div>
            <div className="console-line muted">&gt; demo-package@0.0.0 build</div>
            <div className="console-line muted">&gt; tsc --noEmit</div>
            <div className="console-line blank" />
            <div className="console-line error-line">
              <span>07</span> error TS2322: Type 'string | undefined'
            </div>
            <div className="console-line context-line">
              <span>08</span> return formatLabel(config.label);
            </div>
            <div className="console-line blank" />
            <div className="console-line muted">
              <span>12</span> npm error Lifecycle script "build" failed
            </div>
            <div className="console-cursor" />
          </div>
          <div className="console-insight">
            <div className="console-insight-tabs" role="tablist" aria-label="Demo result view">
              <button
                {...tabProps("diagnosis")}
                className={activeTab === "diagnosis" ? "active" : ""}
                type="button"
              >
                Diagnosis
              </button>
              <button
                {...tabProps("evidence")}
                className={activeTab === "evidence" ? "active" : ""}
                type="button"
              >
                Evidence
              </button>
            </div>
              <div {...panelProps("diagnosis")} className="console-insight-content">
                <div className="console-insight-kicker">
                  <span className="severity-dot severity-error" /> High confidence
                </div>
                <h3>Optional value used as a string</h3>
                <p>Start with the compiler error. The lifecycle message is a downstream summary.</p>
                <div className="console-action">
                  <Icon name="arrow-right" size={14} />
                  <span>Handle the optional label</span>
                </div>
              </div>
              <div {...panelProps("evidence")} className="console-insight-content">
                <div className="console-insight-kicker">
                  <Icon name="hash" size={14} /> Lines 07–08
                </div>
                <h3>Evidence stays close to the cause</h3>
                <p>Every demo finding points to a source line so the next step is reviewable.</p>
                <div className="console-action">
                  <Icon name="file-code" size={14} />
                  <span>Open the log viewer</span>
                </div>
              </div>
          </div>
        </div>
        <div className="console-footnote">
          <span>
            <span className="status-pulse" /> Local-only preview
          </span>
          <button onClick={onOpenDemo} type="button">
            Explore the workspace <Icon name="arrow-up-right" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomePage({ onNavigate, onOpenDemo }: PublicPageProps) {
  const principles = [
    { icon: "lock" as const, title: "Your logs stay close", text: "The MVP is designed for local, browser-based analysis." },
    { icon: "lightbulb" as const, title: "Evidence over mystery", text: "Findings are designed to show the line and the reasoning." },
    { icon: "refresh" as const, title: "Fixes get a rerun", text: "Compare a baseline with a post-fix log when you are ready." },
  ];
  const workflow = [
    { number: "01", title: "Import", text: "Paste a noisy build or select a local text log." },
    { number: "02", title: "Analyze", text: "See a ranked, human-readable view of the likely signals." },
    { number: "03", title: "Investigate", text: "Jump from the summary to the exact evidence lines." },
    { number: "04", title: "Compare", text: "Bring a rerun back to confirm what changed." },
  ];

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <Badge tone="accent" dot>
              Frontier Buildathon · Developer Tools
            </Badge>
            <h1>
              Build failures,
              <br />
              <span>made legible.</span>
            </h1>
            <p>
              BuildMedic turns long Node.js build output into a clear investigation path—what likely broke,
              where to look, and what to verify next.
            </p>
            <div className="hero-actions">
              <Button onClick={onOpenDemo} size="lg" icon="arrow-right" iconPosition="right">
                Try an example log
              </Button>
              <AppLink className="text-link" onNavigate={onNavigate} to="/how-it-works">
                See how it works <Icon name="arrow-down" size={15} />
              </AppLink>
            </div>
            <div className="hero-assurances">
              <span>
                <Icon name="check" size={13} /> No API key required
              </span>
              <span>
                <Icon name="check" size={13} /> Browser-first by design
              </span>
              <span>
                <Icon name="check" size={13} /> Demo data is labeled
              </span>
            </div>
          </div>
          <HeroConsole onOpenDemo={onOpenDemo} />
        </div>
        <div aria-hidden="true" className="home-hero-gridline" />
      </section>

      <section className="principles-section">
        <div className="container principles-grid">
          {principles.map((principle) => (
            <div className="principle" key={principle.title}>
              <span className="principle-icon">
                <Icon name={principle.icon} size={18} />
              </span>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home-section workflow-section">
        <div className="container">
          <SectionHeading
            description="A focused loop for moving from a wall of output to the next useful decision."
            eyebrow="The workflow"
            title="A calmer way to investigate"
          />
          <div className="workflow-grid">
            {workflow.map((step, index) => (
              <div className="workflow-step" key={step.number}>
                <span className="workflow-number">{step.number}</span>
                <div className="workflow-step-content">
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
                {index < workflow.length - 1 ? <Icon className="workflow-arrow" name="arrow-right" size={16} /> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section feature-preview-section">
        <div className="container feature-preview-grid">
          <div className="feature-preview-copy">
            <span className="eyebrow">Built for the hard part</span>
            <h2>Less scrolling. More signal.</h2>
            <p>
              The workspace keeps sanitized output, causal hints, and comparison in the same mental model—without
              pretending a heuristic is a certainty.
            </p>
            <div className="feature-checklist">
              <div>
                <Icon name="check-circle" size={17} />
                <span>Evidence-backed finding cards</span>
              </div>
              <div>
                <Icon name="check-circle" size={17} />
                <span>Line-aware log viewer</span>
              </div>
              <div>
                <Icon name="check-circle" size={17} />
                <span>Before / after verification</span>
              </div>
            </div>
            <ArrowLink href="/features" label="Explore the product surface" onNavigate={onNavigate} />
          </div>
          <div className="feature-preview-panel">
            <div className="mini-panel-head">
              <span>analysis.summary</span>
              <Badge tone="success" size="sm" dot>
                 Example finding
              </Badge>
            </div>
            <div className="mini-root-cause">
              <div className="mini-root-cause-icon">
                <Icon name="circle-alert" size={18} />
              </div>
              <div>
                <span className="mini-label">Likely root cause</span>
                <strong>Type mismatch at the call site</strong>
              </div>
               <Badge tone="info">High confidence</Badge>
            </div>
            <div className="mini-evidence">
              <span className="mini-label">Evidence · line 07</span>
              <code>error TS2322: Type 'string | undefined'</code>
            </div>
            <div className="mini-next-step">
              <Icon name="arrow-right" size={15} />
              <span>Handle the optional value, then rerun the same build.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-section local-section">
        <div className="container local-card">
          <div className="local-card-icon">
            <Icon name="shield-check" size={25} />
          </div>
          <div>
            <span className="eyebrow">A deliberate boundary</span>
            <h2>Local-first is a product decision.</h2>
            <p>
              BuildMedic does not need a hosted AI service or an account. It treats every pasted line as
              untrusted text and keeps the user in control of what gets shared.
            </p>
          </div>
          <AppLink className="text-link text-link-accent" onNavigate={onNavigate} to="/privacy">
            Read the privacy model <Icon name="arrow-right" size={15} />
          </AppLink>
        </div>
      </section>

      <section className="home-cta-section">
        <div className="container home-cta">
          <span className="eyebrow">Ready when the build is not</span>
          <h2>Make the next failure easier to read.</h2>
          <p>Analyze a local Node.js log or start with a labeled example. No log upload or API key required.</p>
          <Button onClick={onOpenDemo} size="lg" icon="arrow-right" iconPosition="right">
            Open local workspace
          </Button>
        </div>
      </section>
    </>
  );
}

const featureCards: { icon: IconName; title: string; description: string; tone: string }[] = [
  { icon: "activity", title: "Root-cause signal", description: "Prioritize likely causes instead of repeating every downstream symptom.", tone: "lime" },
  { icon: "file-code", title: "Evidence lines", description: "Keep the explanation anchored to the exact lines that shaped it.", tone: "cyan" },
  { icon: "lightbulb", title: "Actionable next step", description: "Suggest a safe, reviewable move without running anything for you.", tone: "amber" },
  { icon: "shield-check", title: "Fix verification", description: "Compare baseline and rerun findings to see what actually changed.", tone: "blue" },
  { icon: "search", title: "Readable log viewer", description: "Search, filter, and navigate dense output without losing context.", tone: "violet" },
  { icon: "lock", title: "Local-by-default", description: "No required backend, account, AI key, or telemetry in the MVP.", tone: "rose" },
];

export function FeaturesPage({ onNavigate, onOpenDemo }: PublicPageProps) {
  return (
    <>
      <PublicPageHeader
        description="A focused diagnostic surface for the moments when a Node.js build gives you too much output and too little direction."
        eyebrow="Product surface"
        title={
          <>
            The useful parts of a build log,
            <br />
            brought forward.
          </>
        }
      >
        <Button onClick={onOpenDemo} icon="arrow-right" iconPosition="right">
          Analyze an example log
        </Button>
      </PublicPageHeader>
      <section className="public-section features-grid-section">
        <div className="container">
          <div className="feature-card-grid">
            {featureCards.map((feature) => (
              <Card className={`feature-card feature-card-${feature.tone}`} key={feature.title}>
                <span className="feature-card-icon">
                  <Icon name={feature.icon} size={20} />
                </span>
                <h2>{feature.title}</h2>
                <p>{feature.description}</p>
                <span className="feature-card-line" />
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="public-section feature-detail-section">
        <div className="container feature-detail-grid">
          <div className="feature-detail-visual">
            <div className="detail-window">
              <div className="detail-window-top">
                <span className="detail-window-dot" />
                <span>diagnostic.finding</span>
              </div>
              <div className="detail-window-body">
                <div className="detail-line detail-line-muted">finding.ruleId</div>
                <div className="detail-code-line">
                  <span>"typescript/compiler-diagnostic"</span>
                </div>
                <div className="detail-line detail-line-muted">finding.evidence</div>
                <div className="detail-evidence-line">
                  <span>07</span>
                  <code>error TS2322: Type 'string | undefined'</code>
                </div>
                <div className="detail-evidence-line detail-evidence-muted">
                  <span>08</span>
                  <code>return formatLabel(config.label);</code>
                </div>
                <div className="detail-status-row">
                  <Badge tone="error" dot>
                    Error
                  </Badge>
                  <Badge tone="info">High confidence</Badge>
                  <span>Illustrative finding</span>
                </div>
              </div>
            </div>
          </div>
          <div className="feature-detail-copy">
            <span className="eyebrow">Structured, not magical</span>
            <h2>Every explanation has a trail back to the log.</h2>
            <p>
              BuildMedic returns typed findings: a category, a confidence level, the relevant line, and a
              suggested action. That structure makes the result easier to scan, share, and test.
            </p>
            <div className="detail-bullets">
              <div>
                <span>01</span>
                <p>Know why a finding exists before you act on it.</p>
              </div>
              <div>
                <span>02</span>
                <p>Keep the raw evidence one click away from the summary.</p>
              </div>
              <div>
                <span>03</span>
                <p>Make uncertainty visible instead of hiding it behind confident copy.</p>
              </div>
            </div>
            <ArrowLink href="/documentation" label="Read the architecture" onNavigate={onNavigate} />
          </div>
        </div>
      </section>
    </>
  );
}

export function HowItWorksPage({ onOpenDemo }: PublicPageProps) {
  const stages = [
    { number: "01", icon: "upload-cloud" as const, title: "Import", body: "Paste a build log or select a local text file. Input boundaries are explicit and validated before analysis.", detail: "Text stays in the active browser session." },
    { number: "02", icon: "activity" as const, title: "Analyze", body: "Deterministic local rules recognize supported failure families and rank evidence-backed signals.", detail: "Unknown output becomes a clear no-match state." },
    { number: "03", icon: "search" as const, title: "Investigate", body: "Open a finding to read the explanation, evidence lines, confidence, and a human-reviewable next step.", detail: "No command is executed on your behalf." },
    { number: "04", icon: "refresh" as const, title: "Compare", body: "Bring a rerun back to see resolved, persistent, new, or uncertain signals.", detail: "A log comparison is not proof that a build passed." },
  ];

  return (
    <>
      <PublicPageHeader
        description="The product is shaped around a simple loop: keep the log local, narrow the signal, investigate with evidence, and verify the rerun."
        eyebrow="The loop"
        title={
          <>
            From wall of text
            <br />
            to next useful move.
          </>
        }
      >
        <Button onClick={onOpenDemo} icon="arrow-right" iconPosition="right">
          Walk through an example
        </Button>
      </PublicPageHeader>
      <section className="public-section how-flow-section">
        <div className="container">
          <div className="how-flow">
            {stages.map((stage, index) => (
              <div className="how-stage" key={stage.number}>
                <div className="how-stage-number">{stage.number}</div>
                <div className="how-stage-icon">
                  <Icon name={stage.icon} size={21} />
                </div>
                <h2>{stage.title}</h2>
                <p>{stage.body}</p>
                <span className="how-stage-detail">{stage.detail}</span>
                {index < stages.length - 1 ? <Icon className="how-stage-arrow" name="arrow-right" size={18} /> : null}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="public-section how-boundary-section">
        <div className="container how-boundary-grid">
          <Card className="boundary-card boundary-card-no">
            <span className="boundary-card-icon">
              <Icon name="x" size={19} />
            </span>
            <span className="eyebrow">What it will not do</span>
            <h2>No shell access. No automatic fixes.</h2>
            <p>BuildMedic is meant to help you decide. It will not run commands, edit files, or treat a log-provided URL as an instruction.</p>
          </Card>
          <Card className="boundary-card boundary-card-yes">
            <span className="boundary-card-icon">
              <Icon name="check" size={19} />
            </span>
            <span className="eyebrow">What it should do</span>
            <h2>Show the evidence and the uncertainty.</h2>
            <p>Each finding carries source evidence, an explanation, and qualitative confidence. Unknown and ambiguous output stays visible.</p>
          </Card>
        </div>
      </section>
      <section className="public-section centered-cta-section">
        <div className="container centered-cta">
          <DemoNotice>Examples are labeled; your submitted log is analyzed by the real local engine.</DemoNotice>
          <h2>Ready to see the surface?</h2>
          <p>Open the frontend workspace and try the input, result, log viewer, and verification flows.</p>
          <Button onClick={onOpenDemo} size="lg" icon="arrow-right" iconPosition="right">
            Open BuildMedic Lab
          </Button>
        </div>
      </section>
    </>
  );
}

const documentationSections = [
  {
    id: "product",
    icon: "book-open" as const,
    title: "Product requirements",
    description: "The intended MVP scope, personas, acceptance criteria, and explicit non-goals.",
    href: "/documentation#product",
    tag: "PRD",
  },
  {
    id: "architecture",
    icon: "layers" as const,
    title: "Architecture",
    description: "Pure domain boundaries, background workers, and the connected browser workspace.",
    href: "/documentation#architecture",
    tag: "Design",
  },
  {
    id: "security",
    icon: "shield-check" as const,
    title: "Security model",
    description: "Threats, input handling, local privacy, and supply-chain expectations.",
    href: "/documentation#security",
    tag: "Trust",
  },
  {
    id: "testing",
    icon: "check-circle" as const,
    title: "Testing strategy",
    description: "Offline fixtures, UI journeys, accessibility, security, and performance checks.",
    href: "/documentation#testing",
    tag: "Quality",
  },
  {
    id: "deployment",
    icon: "globe" as const,
    title: "Deployment",
    description: "Static browser delivery, Linux CI, and Docker build/startup verification.",
    href: "/documentation#deployment",
    tag: "Ops",
  },
  {
    id: "contributing",
    icon: "github" as const,
    title: "Contributing",
    description: "How to propose a focused change while keeping diagnostics explainable and safe.",
    href: "/documentation#contributing",
    tag: "Open source",
  },
];

export function DocumentationPage({ onNavigate, onNotify }: PublicPageProps) {
  const [activeSection, setActiveSection] = useState(() => documentationSections.some((section) => `#${section.id}` === window.location.hash) ? window.location.hash.slice(1) : "product");
  const activeDoc = documentationSections.find((section) => section.id === activeSection) ?? documentationSections[0];

  const docCopy: Record<string, { title: string; paragraphs: string[]; points: string[] }> = {
    product: {
      title: "Product requirements",
      paragraphs: [
        "BuildMedic is an offline-first browser tool for turning Node.js build logs into prioritized, understandable diagnostics.",
        "The MVP is intentionally bounded: paste or select a log, inspect evidence-backed findings, and compare a baseline with a rerun. It does not execute commands or require a hosted AI service.",
      ],
      points: ["Paste and local-file inputs", "Evidence lines with confidence", "Human-reviewable next steps", "Before / after verification"],
    },
    architecture: {
      title: "Architecture",
      paragraphs: [
        "The implementation separates the analyzer, diagnostics, verification, shared types, and React presentation layers. Module Web Workers keep large-log processing off the UI thread.",
        "Domain functions receive explicit values and return serializable results without reading project files, spawning processes, or making requests. No analysis API is required.",
      ],
      points: ["Pure domain contracts", "Typed findings and stable rule IDs", "No engine logic in views", "No backend required"],
    },
    security: {
      title: "Security model",
      paragraphs: [
        "Log content is untrusted text. The UI renders it as text, enforces input/resource limits, and never executes commands or fetches URLs from a log.",
        "Local-first is a product boundary, not a universal security guarantee. The security document keeps the implementation honest about redaction, dependencies, and future hosted modes.",
      ],
      points: ["No required network request", "Bounded input and evidence", "No automatic remediation", "Secrets stay out of client builds"],
    },
    testing: {
      title: "Testing strategy",
      paragraphs: [
        "Offline tests cover validation, domain rules, stable identities, conservative comparisons, redaction, storage privacy, and actual App workflows including cancellation and retry.",
        "The repository is intended to stay reproducible offline. Docker verification belongs to a Linux GitHub Actions runner because Docker is unavailable on the local Windows machine.",
      ],
      points: ["Unit and integration fixtures", "UI and keyboard journeys", "Security regression cases", "Performance budgets"],
    },
    deployment: {
      title: "Deployment",
      paragraphs: [
        "The MVP is a static browser app. Serve the built assets over HTTPS, or locally with the included Node static server; no database, account, or runtime secret is needed.",
        "The multi-stage Dockerfile is built and smoke-tested by Linux CI. Initial installation and loading need local assets; analysis itself needs no network connection. There is no service-worker offline reload cache.",
      ],
      points: ["Node.js 22 toolchain", "Lockfile-based installs", "Static production assets", "CI-owned Docker build"],
    },
    contributing: {
      title: "Contributing",
      paragraphs: [
        "BuildMedic welcomes small, reviewable improvements that make diagnostics safer, clearer, more reproducible, or more accessible.",
        "Before implementation starts, read the product and security boundaries. Do not include real build logs, credentials, private paths, or unsupported claims in issues, fixtures, or screenshots.",
      ],
      points: ["Focused branches and commits", "Sanitized fixtures", "Strict TypeScript", "Documented verification"],
    },
  };

  const copy = docCopy[activeSection];

  function copySectionLink() {
    void copyPublicText(`${window.location.origin}/documentation#${activeSection}`, onNotify, "Documentation section link copied locally.");
  }

  return (
    <>
      <PublicPageHeader
        description="The implemented product boundaries: browser-local diagnostics, inspectable evidence, conservative log comparison, and reproducible deployment."
        eyebrow="Project docs"
        title={
          <>
            A clear contract
            <br />
            behind every rule.
          </>
        }
      />
      <section className="public-section documentation-section">
        <div className="container documentation-layout">
          <aside className="documentation-sidebar" aria-label="Documentation sections">
            <span className="doc-sidebar-label">Read the plan</span>
            {documentationSections.map((section) => (
              <button
                className={`doc-nav-item${section.id === activeSection ? " active" : ""}`}
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                <span className="doc-nav-icon">
                  <Icon name={section.icon} size={16} />
                </span>
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.tag}</small>
                </span>
                <Icon name="chevron-right" size={14} />
              </button>
            ))}
            <Divider />
            <a className="doc-github-link" href="https://github.com/hussnainahmedd/BuildMedic" rel="noreferrer" target="_blank">
              <Icon name="github" size={16} />
              <span>Read source on GitHub</span>
              <Icon name="external-link" size={13} />
            </a>
          </aside>
          <article className="documentation-article" id={activeSection}>
            <div className="doc-article-topline">
              <Badge tone="accent" dot>
                {activeDoc.tag}
              </Badge>
              <span>Planned / documented</span>
            </div>
            <h2>{copy.title}</h2>
            {copy.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <div className="doc-points">
              {copy.points.map((point) => (
                <div key={point}>
                  <Icon name="check" size={15} />
                  <span>{point}</span>
                </div>
              ))}
            </div>
            <div className="doc-article-note">
              <Icon name="info" size={17} />
              <div>
                <strong>Source of truth</strong>
                <p>These summaries mirror the Markdown documents in this repository. Implementation status is kept explicit.</p>
              </div>
            </div>
            <div className="doc-article-actions">
              <Button onClick={copySectionLink} variant="secondary" icon="copy">
                Copy section link
              </Button>
              <AppLink className="text-link" onNavigate={onNavigate} to="/app/help">
                Open workspace help <Icon name="arrow-right" size={15} />
              </AppLink>
            </div>
          </article>
        </div>
      </section>
    </>
  );
}

export function AboutPage({ onNavigate, onOpenDemo }: PublicPageProps) {
  return (
    <>
      <PublicPageHeader
        description="BuildMedic is an open-source buildathon project exploring how developer tools can make failure investigation calmer without hiding uncertainty."
        eyebrow="The project"
        title={
          <>
            A small tool for
            <br />
            a very familiar feeling.
          </>
        }
      />
      <section className="public-section about-section">
        <div className="container about-grid">
          <div className="about-copy">
            <span className="eyebrow">Why BuildMedic exists</span>
            <h2>Build output is valuable. It is just rarely shaped for humans.</h2>
            <p>
              The project starts with a modest idea: make the first investigation pass more legible. Keep the line,
              keep the uncertainty, and make it easy to bring a rerun back into the conversation.
            </p>
            <p>
              The workspace is connected to a deterministic TypeScript engine. Only the optional example input and
              public-page illustrations are samples; submitted logs generate real, evidence-backed diagnostics locally.
            </p>
            <div className="about-actions">
              <Button onClick={onOpenDemo} icon="arrow-right" iconPosition="right">
                Analyze an example
              </Button>
              <a className="text-link" href="https://github.com/hussnainahmedd/BuildMedic" rel="noreferrer" target="_blank">
                View repository <Icon name="external-link" size={15} />
              </a>
            </div>
          </div>
          <div className="about-principles">
            <Card>
              <span className="principle-index">01</span>
              <h3>Useful over impressive</h3>
              <p>Every visual should help a developer decide what to inspect next.</p>
            </Card>
            <Card>
              <span className="principle-index">02</span>
              <h3>Local over extractive</h3>
              <p>The MVP does not require an account, an AI key, or a log upload endpoint.</p>
            </Card>
            <Card>
              <span className="principle-index">03</span>
              <h3>Honest over magical</h3>
              <p>Examples are labeled, confidence is qualitative, and unknowns remain visible.</p>
            </Card>
          </div>
        </div>
      </section>
      <section className="public-section about-links-section">
        <div className="container about-links-grid">
          <AppLink className="about-link-card" onNavigate={onNavigate} to="/support">
            <Icon name="message-circle" size={21} />
            <span>
              <strong>Want to help shape it?</strong>
              <small>Find the contribution and support paths.</small>
            </span>
            <Icon name="arrow-up-right" size={16} />
          </AppLink>
          <AppLink className="about-link-card" onNavigate={onNavigate} to="/security">
            <Icon name="shield-check" size={21} />
            <span>
              <strong>Read the boundaries</strong>
              <small>See what local-first means—and what it does not promise.</small>
            </span>
            <Icon name="arrow-up-right" size={16} />
          </AppLink>
        </div>
      </section>
    </>
  );
}

export function SupportPage({ onNavigate, onNotify }: PublicPageProps) {
  const supportItems = [
    { icon: "book-open" as const, title: "Start with the docs", text: "Read the product boundaries and frontend guide before opening a question.", action: "Open documentation", href: "/documentation" },
    { icon: "github" as const, title: "Open a GitHub issue", text: "Use a sanitized reproduction and explain the user outcome you expected.", action: "Go to GitHub", href: "https://github.com/hussnainahmedd/BuildMedic/issues" },
    { icon: "message-circle" as const, title: "Share a design thought", text: "Feedback on hierarchy, accessibility, and developer workflow is welcome.", action: "Copy support note", href: "#copy" },
  ];

  function copySupportNote() {
    void copyPublicText("BuildMedic support note: I have a question about local diagnostics. Expected behavior: ... Actual behavior: ... Sanitized reproduction: ...", onNotify, "Support note copied locally—remove private log content before sharing.");
  }

  return (
    <>
      <PublicPageHeader
        description="BuildMedic is early and open. The best support request is a small, sanitized context window and a clear description of what should have happened."
        eyebrow="Support"
        title={
          <>
            Bring the useful
            <br />
            context.
          </>
        }
      />
      <section className="public-section support-section">
        <div className="container support-grid">
          {supportItems.map((item) => (
            <Card className="support-card" key={item.title}>
              <span className="support-card-icon">
                <Icon name={item.icon} size={20} />
              </span>
              <h2>{item.title}</h2>
              <p>{item.text}</p>
              {item.href.startsWith("http") ? (
                <a className="arrow-link" href={item.href} rel="noreferrer" target="_blank">
                  <span>{item.action}</span>
                  <Icon name="external-link" size={14} />
                </a>
              ) : item.href === "#copy" ? (
                <button className="arrow-link arrow-link-button" onClick={copySupportNote} type="button">
                  <span>{item.action}</span>
                  <Icon name="copy" size={14} />
                </button>
              ) : (
                <AppLink className="arrow-link" onNavigate={onNavigate} to={item.href}>
                  <span>{item.action}</span>
                  <Icon name="arrow-right" size={14} />
                </AppLink>
              )}
            </Card>
          ))}
        </div>
      </section>
      <section className="public-section support-guidelines-section">
        <div className="container support-guidelines">
          <div>
            <span className="eyebrow">Before you share</span>
            <h2>Keep the reproduction safe to publish.</h2>
          </div>
          <div className="support-guideline-list">
            <div><Icon name="check" size={15} /><span>Remove tokens, passwords, private URLs, and absolute paths.</span></div>
            <div><Icon name="check" size={15} /><span>Include the command family and the smallest useful line window.</span></div>
            <div><Icon name="check" size={15} /><span>Say whether the result is live, simulated, or a design question.</span></div>
          </div>
        </div>
      </section>
    </>
  );
}

export function PrivacyPage({ onNavigate }: PublicPageProps) {
  return (
    <>
      <PublicPageHeader
        description="The MVP is designed to keep build logs in the active browser session. This page describes the intended boundary, not a claim that every future deployment is automatically secure."
        eyebrow="Privacy"
        title={
          <>
            Your build log is
            <br />
            not a product metric.
          </>
        }
      />
      <section className="public-section policy-section">
        <div className="container policy-layout">
          <aside className="policy-aside">
            <Badge tone="success" dot>
              Local by design
            </Badge>
            <p>No analytics, remote AI, or account is required for analysis.</p>
            <AppLink className="arrow-link" onNavigate={onNavigate} to="/security">
              Security boundaries <Icon name="arrow-right" size={14} />
            </AppLink>
          </aside>
          <article className="policy-article">
            <PolicyBlock title="What stays local">
              <p>Analysis runs in a browser Web Worker against the text you provide. There is no required backend API, database, or external AI request.</p>
            </PolicyBlock>
            <PolicyBlock title="What is not stored by default">
              <p>Raw logs remain in bounded session memory. Storage contains only whitelisted preferences and generic analysis metadata, not raw logs, evidence, filenames, or log-derived fingerprints. Clear history also clears cached session logs.</p>
            </PolicyBlock>
            <PolicyBlock title="Sharing is a user decision">
              <p>Copying a summary, exporting a report, or opening a GitHub link is an explicit user action. Future hosted modes would need a separate opt-in, retention policy, and threat model.</p>
            </PolicyBlock>
            <PolicyBlock title="What this page does not promise">
              <p>Local-first does not remove the need to review browser extensions, hosting, dependencies, or exports. Redaction is best-effort, not perfect secret detection. Review reports before sharing.</p>
            </PolicyBlock>
          </article>
        </div>
      </section>
    </>
  );
}

function PolicyBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="policy-block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SecurityPage({ onNavigate }: PublicPageProps) {
  const controls = [
    { icon: "lock" as const, title: "No automatic execution", text: "Commands and URLs in logs are inert text. Suggested fixes never run automatically." },
    { icon: "sliders" as const, title: "Bounded input", text: "Validation and resource limits are part of the product requirements, not an afterthought." },
    { icon: "shield-check" as const, title: "Explainable findings", text: "A result should expose evidence and confidence instead of hiding a heuristic." },
  ];
  return (
    <>
      <PublicPageHeader
        description="Local processing, validated input, bounded workers, safe text rendering, and redacted exports are implemented. These controls are not a promise of perfect security or a substitute for independent review."
        eyebrow="Security"
        title={
          <>
            Make the safe path
            <br />
            the obvious path.
          </>
        }
      />
      <section className="public-section security-controls-section">
        <div className="container">
          <div className="security-control-grid">
            {controls.map((control) => (
              <Card className="security-control-card" key={control.title}>
                <span className="security-control-icon"><Icon name={control.icon} size={20} /></span>
                <h2>{control.title}</h2>
                <p>{control.text}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>
      <section className="public-section security-note-section">
        <div className="container security-note">
          <div className="security-note-symbol"><Icon name="info" size={22} /></div>
          <div>
            <span className="eyebrow">Honest status</span>
            <h2>Reviewable controls, explicit limitations.</h2>
            <p>Read the repository threat model and regression tests. Redaction can miss project-specific secrets; log comparisons do not prove that a real build passed.</p>
          </div>
          <AppLink className="text-link" onNavigate={onNavigate} to="/documentation#security">
            Read the security model <Icon name="arrow-right" size={15} />
          </AppLink>
        </div>
      </section>
    </>
  );
}

export function NotFoundPage({ onNavigate, onOpenDemo }: PublicPageProps) {
  return (
    <section className="not-found-page">
      <div className="not-found-grid" aria-hidden="true" />
      <div className="not-found-content">
        <span className="not-found-code">404 / signal not found</span>
        <h1>This route did not make it into the build.</h1>
        <p>Try the workspace or head back to the product overview. No data was lost.</p>
        <div className="not-found-actions">
          <Button onClick={onOpenDemo} icon="arrow-right" iconPosition="right">
            Open workspace
          </Button>
          <Button onClick={() => onNavigate("/")} variant="secondary" icon="arrow-left">
            Back home
          </Button>
        </div>
      </div>
    </section>
  );
}
