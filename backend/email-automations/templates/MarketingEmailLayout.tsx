import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
// NEVER REMOVE THIS IMPORT
import * as React from "react";

export interface MarketingEmailFeaturedItem {
  imageUrl?: string;
  name: string;
  subtitle?: string;
  priceLabel?: string;
}

export interface MarketingSocialLink {
  platform: string;
  url: string;
}

export interface MarketingEmailLayoutProps {
  storeName: string;
  logoUrl?: string;
  preheader: string;
  headline: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
  featuredItem?: MarketingEmailFeaturedItem;
  showReviewStars?: boolean;
  discountBadgeText?: string;
  socialLinks?: MarketingSocialLink[];
  unsubscribeUrl: string;
  contactEmail?: string;
  dir?: "ltr" | "rtl";
}

export const MarketingEmailLayout = ({
  storeName,
  logoUrl,
  preheader,
  headline,
  body,
  ctaLabel,
  ctaHref,
  featuredItem,
  showReviewStars,
  discountBadgeText,
  socialLinks,
  unsubscribeUrl,
  contactEmail,
  dir = "ltr",
}: MarketingEmailLayoutProps) => {
  return (
    <Html dir={dir} lang={dir === "rtl" ? "ar" : "en"}>
      <Head>
        <title>{headline}</title>
        <Preview>{preheader}</Preview>
      </Head>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={storeName}
                height="40"
                style={{ margin: "0 auto", display: "block", objectFit: "contain", maxWidth: "180px" }}
              />
            ) : (
              <Heading as="h1" style={logoText}>
                {storeName}
              </Heading>
            )}
          </Section>

          {/* Headline + body */}
          <Section style={{ ...section, textAlign: "center" as const }}>
            <Heading as="h2" style={headlineStyle}>
              {headline}
            </Heading>
            <Text style={paragraph}>{body}</Text>
          </Section>

          {/* Featured item card — image stacked above details, everything centered */}
          {featuredItem && (
            <Section style={section}>
              <Section style={itemCard}>
                {featuredItem.imageUrl && (
                  <Img
                    src={featuredItem.imageUrl}
                    alt={featuredItem.name}
                    width="96"
                    height="96"
                    style={itemImage}
                  />
                )}
                <Text style={itemName}>{featuredItem.name}</Text>
                {featuredItem.subtitle && (
                  <Text style={itemSubtitle}>{featuredItem.subtitle}</Text>
                )}
                {featuredItem.priceLabel && (
                  <Text style={itemPrice}>{featuredItem.priceLabel}</Text>
                )}
              </Section>
            </Section>
          )}

          {/* Review stars */}
          {showReviewStars && (
            <Section style={{ ...section, textAlign: "center" as const }}>
              <Text style={starsRow}>☆ ☆ ☆ ☆ ☆</Text>
            </Section>
          )}

          {/* Discount badge */}
          {discountBadgeText && (
            <Section style={{ ...section, textAlign: "center" as const }}>
              <Text style={discountBadge}>{discountBadgeText}</Text>
            </Section>
          )}

          {/* CTA */}
          {ctaLabel && ctaHref && (
            <Section style={{ ...section, textAlign: "center" as const }}>
              <Button href={ctaHref} style={ctaButton}>
                {ctaLabel}
              </Button>
            </Section>
          )}

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            {socialLinks && socialLinks.length > 0 && (
              <Text style={socialRow}>
                {socialLinks.map((s, i) => (
                  <React.Fragment key={s.platform}>
                    {i > 0 && " · "}
                    <Link href={s.url} style={socialLink}>
                      {s.platform.charAt(0).toUpperCase() + s.platform.slice(1)}
                    </Link>
                  </React.Fragment>
                ))}
              </Text>
            )}
            {contactEmail && (
              <Text style={footerText}>
                Questions?{" "}
                <Link href={`mailto:${contactEmail}`} style={link}>
                  {contactEmail}
                </Link>
              </Text>
            )}
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
            </Text>
            <Text style={footerText}>
              <Link href={unsubscribeUrl} style={unsubscribeLink}>
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const main = {
  backgroundColor: "#f9fafb",
  fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "24px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  border: "1px solid #e5e7eb",
};

const header = {
  padding: "32px 24px 24px",
  textAlign: "center" as const,
};

const logoText = {
  fontSize: "24px",
  fontWeight: "700",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#1c1917",
  margin: "0",
  textAlign: "center" as const,
};

const section = {
  padding: "12px 24px",
};

const headlineStyle = {
  fontSize: "22px",
  fontWeight: "600",
  color: "#1c1917",
  margin: "0 0 12px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#44403c",
  margin: "0",
};

const itemCard = {
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  padding: "20px 16px",
  textAlign: "center" as const,
};

const itemImage = {
  borderRadius: "6px",
  objectFit: "cover" as const,
  margin: "0 auto 12px",
  display: "block" as const,
};

const itemName = {
  fontSize: "15px",
  fontWeight: "600",
  color: "#1c1917",
  margin: "0 0 4px",
};

const itemSubtitle = {
  fontSize: "13px",
  color: "#78716c",
  margin: "0 0 4px",
};

const itemPrice = {
  fontSize: "14px",
  fontWeight: "600",
  color: "#1c1917",
  margin: "0",
};

const starsRow = {
  fontSize: "24px",
  letterSpacing: "6px",
  color: "#d4a72c",
  margin: "0",
};

const discountBadge = {
  fontSize: "13px",
  fontWeight: "600",
  color: "#1c1917",
  backgroundColor: "#f5f5f4",
  border: "1px dashed #d6d3d1",
  borderRadius: "6px",
  padding: "10px 16px",
  display: "inline-block",
  margin: "0",
};

const ctaButton = {
  backgroundColor: "#1c1917",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  padding: "14px 32px",
  borderRadius: "6px",
  textDecoration: "none",
  display: "inline-block",
};

const divider = {
  borderTop: "1px solid #e5e7eb",
  margin: "8px 0 0",
};

const footer = {
  padding: "20px 24px",
  textAlign: "center" as const,
};

const socialRow = {
  fontSize: "12px",
  color: "#78716c",
  margin: "0 0 8px",
};

const socialLink = {
  color: "#78716c",
  textDecoration: "none",
};

const footerText = {
  fontSize: "12px",
  color: "#a8a29e",
  margin: "4px 0",
};

const link = {
  color: "#1c1917",
  textDecoration: "underline",
};

const unsubscribeLink = {
  color: "#a8a29e",
  textDecoration: "underline",
};
