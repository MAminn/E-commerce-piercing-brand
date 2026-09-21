import { usePageContext } from "vike-react/usePageContext";

/**
 * 404 / 500 page.
 *
 * This used to be two bare <h1>/<p> pairs with no layout, no container and no
 * styling at all — unstyled black Times New Roman on the browser's default
 * white, inside the Percé shell. A customer who mistyped a URL or followed a
 * dead link saw something indistinguishable from a broken deployment.
 *
 * It states only what is known (the page is missing, or the server failed)
 * and offers the two destinations that always exist.
 */
export default function Page() {
  const { is404 } = usePageContext();

  const title = is404 ? "Page not found" : "Something went wrong";
  const body = is404
    ? "This page does not exist, or it has moved."
    : "The page could not be loaded. Please try again.";

  return (
    <div className='perce-header-offset flex min-h-[70vh] items-center justify-center bg-perce-bg px-4 py-16'>
      <div className='max-w-md text-center'>
        <p className='perce-eyebrow'>{is404 ? "404" : "500"}</p>
        <h1 className='perce-section-title mt-3'>{title}</h1>
        <p className='mt-3 text-[length:var(--perce-text-body)] leading-[var(--perce-leading-body)] text-perce-ink-muted'>
          {body}
        </p>
        <div className='mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row'>
          <a
            href='/'
            className='inline-flex min-h-11 items-center justify-center bg-perce-cta px-6 text-[length:var(--perce-text-small)] font-medium text-perce-ink-inverse transition-colors hover:bg-perce-cta-hover'>
            Back to home
          </a>
          <a
            href='/shop'
            className='perce-underline-hover inline-flex min-h-11 items-center justify-center px-2 text-[length:var(--perce-text-small)] font-medium text-perce-ink'>
            Browse the shop
          </a>
        </div>
      </div>
    </div>
  );
}
