import { STORE_NAME } from "#root/shared/config/branding";

export function Head() {
  const title = `${STORE_NAME} — Links`;
  return (
    <>
      <meta name='robots' content='noindex, nofollow' />
      <meta property='og:title' content={title} />
      <meta
        property='og:description'
        content={`Shop, follow, and connect with ${STORE_NAME}.`}
      />
      <meta property='og:type' content='website' />
    </>
  );
}
