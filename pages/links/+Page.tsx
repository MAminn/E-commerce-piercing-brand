import { useState, useEffect } from "react";
import { trpc } from "#root/shared/trpc/client";
import type { LinkTreeConfig } from "#root/shared/types/link-tree";
import { DEFAULT_LINK_TREE_CONFIG } from "#root/shared/types/link-tree";

// ─── Icon Registry ────────────────────────────────────────────────────────────
// Maps icon keys (stored in DB) to SVG render functions.

const ICON_MAP: Record<
  string,
  (props: React.SVGAttributes<SVGSVGElement>) => React.ReactNode
> = {
  link: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <path d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' />
      <path d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' />
    </svg>
  ),
  shop: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <path d='M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z' />
      <line x1='3' x2='21' y1='6' y2='6' />
      <path d='M16 10a4 4 0 0 1-8 0' />
    </svg>
  ),
  instagram: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <rect width='20' height='20' x='2' y='2' rx='5' ry='5' />
      <path d='M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z' />
      <line x1='17.5' x2='17.51' y1='6.5' y2='6.5' />
    </svg>
  ),
  facebook: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <path d='M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z' />
    </svg>
  ),
  tiktok: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78 2.92 2.92 0 0 1 .88.13v-3.5a6.37 6.37 0 0 0-.88-.07 6.37 6.37 0 0 0 0 12.74 6.37 6.37 0 0 0 6.38-6.38V9.4a8.27 8.27 0 0 0 3.72.88V6.84a4.84 4.84 0 0 1-.01-.15z' />
    </svg>
  ),
  whatsapp: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z' />
    </svg>
  ),
  youtube: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <path d='M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17' />
      <path d='m10 15 5-3-5-3z' />
    </svg>
  ),
  x: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z' />
    </svg>
  ),
  email: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <rect width='20' height='16' x='2' y='4' rx='2' />
      <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
    </svg>
  ),
  phone: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      {...props}>
      <path d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' />
    </svg>
  ),
  snapchat: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.959-.289.03-.015.06-.03.09-.03.12 0 .209.045.299.09.239.12.479.24.479.54 0 .449-.63.749-1.244.899l-.21.06c-.12.03-.21.075-.27.12-.12.09-.18.227-.181.39-.001.18.06.33.12.42.181.33.39.57.63.81.57.57 1.32 1.17 1.5 2.19.045.27 0 .57-.165.795-.18.24-.465.405-.749.449-.75.12-1.485.075-2.069.03a5.89 5.89 0 0 0-.57-.03c-.15 0-.269.015-.39.06-.18.06-.36.181-.54.345-.3.27-.576.6-1.215.855-.63.254-1.395.39-2.369.39s-1.739-.136-2.37-.39c-.63-.255-.915-.585-1.215-.855a1.413 1.413 0 0 0-.54-.345c-.12-.045-.24-.06-.39-.06-.195 0-.39.015-.57.03-.585.045-1.319.09-2.069-.03a1.128 1.128 0 0 1-.749-.449 1.067 1.067 0 0 1-.165-.795c.18-1.02.93-1.62 1.5-2.19.24-.24.449-.48.63-.81.06-.09.12-.24.12-.42a.574.574 0 0 0-.18-.39c-.06-.045-.15-.09-.27-.12l-.211-.06c-.614-.15-1.244-.45-1.244-.899 0-.3.24-.42.479-.54.09-.045.18-.075.3-.09.03 0 .06.015.09.03.3.18.66.284.959.289.198 0 .326-.045.401-.09a9.89 9.89 0 0 1-.033-.57c-.104-1.628-.23-3.654.3-4.847C7.86 1.07 11.216.793 12.206.793z' />
    </svg>
  ),
  pinterest: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M12 0a12 12 0 0 0-4.373 23.17c-.1-.937-.2-2.376.04-3.4.22-.924 1.4-5.936 1.4-5.936s-.356-.712-.356-1.764c0-1.652.958-2.886 2.15-2.886 1.014 0 1.503.762 1.503 1.675 0 1.02-.65 2.546-.984 3.96-.28 1.18.592 2.143 1.757 2.143 2.108 0 3.727-2.223 3.727-5.43 0-2.84-2.04-4.824-4.954-4.824-3.374 0-5.353 2.53-5.353 5.147 0 1.02.393 2.113.882 2.706a.355.355 0 0 1 .082.34c-.09.374-.29 1.18-.33 1.344-.052.22-.173.266-.4.16-1.492-.694-2.424-2.876-2.424-4.627 0-3.77 2.74-7.228 7.9-7.228 4.15 0 7.376 2.957 7.376 6.91 0 4.12-2.6 7.436-6.208 7.436-1.212 0-2.352-.63-2.742-1.375l-.746 2.847c-.27 1.04-1 2.343-1.49 3.138A12 12 0 1 0 12 0z' />
    </svg>
  ),
  telegram: (props) => (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      viewBox='0 0 24 24'
      fill='currentColor'
      {...props}>
      <path d='M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z' />
    </svg>
  ),
};

function getIcon(key: string) {
  return ICON_MAP[key] ?? ICON_MAP.link!;
}

// ─── Fallback data (used when DB has no config yet) ───────────────────────────

const FALLBACK_CONFIG: LinkTreeConfig = {
  brandName: "Percée",
  subtitle: "Shop, follow, and connect",
  links: [
    {
      label: "Shop",
      href: "https://perce-eg.com/",
      icon: "shop",
      enabled: true,
    },
    {
      label: "Instagram",
      href: "https://www.instagram.com/piercingsperce/",
      icon: "instagram",
      enabled: true,
    },
    {
      label: "Facebook",
      href: "https://www.facebook.com/share/1HoGwkYpSK/?mibextid=wwXIfr",
      icon: "facebook",
      enabled: true,
    },
    {
      label: "TikTok",
      href: "https://www.tiktok.com/@piercingsperce",
      icon: "tiktok",
      enabled: true,
    },
    {
      label: "WhatsApp",
      href: "https://wa.me/201033036883",
      icon: "whatsapp",
      enabled: true,
    },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Page() {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<LinkTreeConfig>(FALLBACK_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await trpc.settings.getLinkTreeConfig.query();
        if (cancelled) return;
        if (result.success) {
          setConfig((prev) => ({
            brandName: result.result.brandName || prev.brandName,
            subtitle: result.result.subtitle || prev.subtitle,
            links:
              result.result.links.length > 0 ? result.result.links : prev.links,
          }));
        }
      } catch {
        // Silent — use fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const visibleLinks = config.links.filter((l) => l.enabled);
  const brandName = config.brandName || FALLBACK_CONFIG.brandName;
  const subtitle = config.subtitle || FALLBACK_CONFIG.subtitle;
  const footerText = `© ${new Date().getFullYear()} ${brandName}`;

  if (loading) {
    return (
      <div className='min-h-screen bg-black flex items-center justify-center'>
        <div className='w-5 h-5 border border-white/20 border-t-white/60 rounded-full animate-spin' />
      </div>
    );
  }

  return (
    <div className='min-h-screen bg-black flex flex-col items-center justify-center px-6 py-16 font-poppins selection:bg-white/20'>
      {/* Content wrapper */}
      <div
        className={`w-full max-w-md flex flex-col items-center gap-10 transition-all duration-700 ease-out ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}>
        {/* Brand header */}
        <header className='flex flex-col items-center gap-3 text-center'>
          <h1 className='text-white text-3xl sm:text-4xl font-light tracking-[0.25em] uppercase'>
            {brandName}
          </h1>
          <div className='w-8 h-px bg-white/30' aria-hidden='true' />
          <p className='text-white/50 text-sm tracking-[0.12em] font-light'>
            {subtitle}
          </p>
        </header>

        {/* Link stack */}
        <nav className='w-full flex flex-col gap-3' aria-label='Brand links'>
          {visibleLinks.map((link, i) => {
            const IconFn = getIcon(link.icon);
            return (
              <a
                key={`${link.label}-${i}`}
                href={link.href}
                target='_blank'
                rel='noopener noreferrer'
                className='group relative flex items-center gap-4 w-full px-6 py-4 rounded-sm border border-white/8 bg-white/3 text-white/80 transition-all duration-300 ease-out hover:bg-white/7 hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black'
                style={{
                  transitionDelay: mounted ? `${i * 60}ms` : "0ms",
                  opacity: mounted ? 1 : 0,
                  transform: mounted ? "translateY(0)" : "translateY(12px)",
                }}
                aria-label={`${link.label} — opens in new tab`}>
                <span className='shrink-0 w-5 h-5 text-white/40 transition-colors duration-300 group-hover:text-white/70'>
                  {IconFn({ width: 20, height: 20 })}
                </span>
                <span className='text-sm tracking-[0.08em] font-light'>
                  {link.label}
                </span>
                <svg
                  xmlns='http://www.w3.org/2000/svg'
                  viewBox='0 0 24 24'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.5'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  className='ml-auto w-4 h-4 text-white/20 transition-all duration-300 group-hover:text-white/50 group-hover:translate-x-0.5'
                  aria-hidden='true'>
                  <path d='M5 12h14' />
                  <path d='m12 5 7 7-7 7' />
                </svg>
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <footer className='pt-4 text-center'>
          <p className='text-white/20 text-xs tracking-widest font-light'>
            {footerText}
          </p>
        </footer>
      </div>
    </div>
  );
}
