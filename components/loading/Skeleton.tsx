import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/** One visual vocabulary for initial data loading; never use for AI job progress. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`ey-skeleton ${className}`} style={style} />;
}

export function SkeletonRegion({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`ey-skeleton-region ${className}`} role="status" aria-busy="true" aria-label="Loading / Wird geladen">
    <span className="sr-only">Loading / Wird geladen</span>
    <div aria-hidden="true">{children}</div>
  </div>;
}

/** Masks the real rendered layout: wrapping, spacing and breakpoints remain identical. */
export function SkeletonSurface({ children, loading, className = "", as: Tag = "div", ...props }: {
  children: ReactNode; loading: boolean; className?: string; as?: "div" | "main" | "section";
} & HTMLAttributes<HTMLElement>) {
  return <>
    {loading && <span className="sr-only" role="status">Loading / Wird geladen</span>}
    <Tag {...props} className={className} aria-busy={loading} data-skeleton-surface={loading || undefined} inert={loading || undefined}>
      {children}
    </Tag>
  </>;
}

function Lines() {
  return <div className="ey-skeleton-lines"><Skeleton /><Skeleton /><Skeleton style={{ width: "68%" }} /></div>;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return <SkeletonRegion><div className="ey-skeleton-list">{Array.from({ length: rows }, (_, i) =>
    <div className="ey-skeleton-row" key={i}><Skeleton className="ey-skeleton-avatar" /><div className="ey-skeleton-grow"><Skeleton style={{ width: "52%", height: 16 }} /><Skeleton style={{ width: "78%", marginTop: 10 }} /></div></div>
  )}</div></SkeletonRegion>;
}

export function FormSkeleton() {
  return <SkeletonRegion><div className="ey-skeleton-panel"><Skeleton className="ey-skeleton-heading" /><Lines /><div className="ey-skeleton-form-grid">{Array.from({ length: 6 }, (_, i) => <div key={i}><Skeleton style={{ width: "40%", marginBottom: 10 }} /><Skeleton style={{ height: 44 }} /></div>)}</div><Skeleton style={{ height: 120 }} /></div></SkeletonRegion>;
}

/** Uses the directory's actual card classes, including its responsive grid sizing. */
export function ProviderCardSkeleton() {
  return <div className="prov-card" aria-hidden="true"><div className="prov-card-banner"><Skeleton style={{ width: "72%", height: "55%" }} /></div><div className="prov-card-body"><div className="prov-card-title-row"><Skeleton style={{ width: "85%", height: 32 }} /></div><div className="prov-card-meta"><Skeleton style={{ width: "35%" }} /></div></div></div>;
}

export function DetailSkeleton({ kind }: { kind: "profile" | "post" | "whitepaper" | "webinar" }) {
  if (kind === "profile") return <SkeletonRegion><section className="pp-hero"><div className="pp-banner"><Skeleton style={{ height: "100%", borderRadius: 0 }} /></div><div className="pp-identity"><div className="pp-identity-main"><Skeleton className="pp-logo" /><div className="ey-skeleton-grow"><Skeleton className="ey-skeleton-heading" /><Lines /></div></div></div></section><div className="pp-content-card"><FormSkeleton /></div></SkeletonRegion>;
  if (kind === "post") return <SkeletonRegion><section className="pa-hero"><div className="pa-hero-copy"><Skeleton style={{ width: 110 }} /><Skeleton className="ey-skeleton-title" /><Lines /></div><Skeleton className="ey-skeleton-cover" /></section><div className="ey-skeleton-panel"><Lines /><Lines /><Lines /></div></SkeletonRegion>;
  if (kind === "webinar") return <SkeletonRegion><article className="wb-page"><section className="wb-hero"><div className="wb-hero-content"><Skeleton style={{ width: 100 }} /><Skeleton className="ey-skeleton-title" /><Lines /></div></section><div className="ey-skeleton-panel"><Lines /><FormSkeleton /></div></article></SkeletonRegion>;
  return <SkeletonRegion><article className="wp-card"><header className="wp-intro"><Skeleton style={{ width: 110 }} /><Skeleton className="ey-skeleton-title" /><div className="ey-skeleton-row"><Skeleton className="ey-skeleton-avatar" /><Skeleton style={{ width: "45%" }} /></div></header><section className="wp-content"><Lines /><Lines /><Skeleton className="ey-skeleton-cover" /></section></article></SkeletonRegion>;
}

export function PageSkeleton({ kind = "dashboard" }: { kind?: "dashboard" | "chat" | "auth" }) {
  if (kind === "auth") return <div className="ey-skeleton-auth"><FormSkeleton /></div>;
  return <SkeletonRegion className={`ey-skeleton-page ey-skeleton-page-${kind}`}><div className="ey-skeleton-app"><aside className="ey-skeleton-sidebar"><Skeleton className="ey-skeleton-heading" /><ListSkeleton rows={7} /></aside><div className="ey-skeleton-main"><div className="ey-skeleton-topbar"><Skeleton style={{ width: "35%", height: 24 }} /><Skeleton className="ey-skeleton-avatar" /></div><div className="ey-skeleton-content">{kind === "chat" ? <FormSkeleton /> : <><Skeleton className="ey-skeleton-heading" /><div className="ey-skeleton-stats">{Array.from({ length: 4 }, (_, i) => <div className="ey-skeleton-panel" key={i}><Skeleton style={{ width: "60%" }} /><Skeleton style={{ width: "45%", height: 32, marginTop: 16 }} /></div>)}</div><ListSkeleton rows={6} /></>}</div></div></div></SkeletonRegion>;
}
