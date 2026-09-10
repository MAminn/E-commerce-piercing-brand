import {
  Body,
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

interface MinimalPasswordResetProps {
  storeName: string;
  logoUrl?: string;
  userName: string;
  resetUrl: string;
}

export const MinimalPasswordResetTemplate = ({
  storeName,
  logoUrl,
  userName,
  resetUrl,
}: MinimalPasswordResetProps) => {
  return (
    <Html>
      <Head>
        <title>Reset Your Password — {storeName}</title>
        <Preview>Reset your password for {storeName}</Preview>
      </Head>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={storeName}
                height="48"
                style={{ margin: "0 auto", display: "block", objectFit: "contain", maxWidth: "200px" }}
              />
            ) : (
              <Heading as="h1" style={logoText}>
                {storeName}
              </Heading>
            )}
          </Section>

          <Hr style={divider} />

          <Section style={section}>
            <Heading as="h2" style={sectionTitle}>
              Reset Your Password
            </Heading>
            <Text style={paragraph}>Hello {userName},</Text>
            <Text style={paragraph}>
              We received a request to reset your password. Click the button
              below to choose a new one:
            </Text>
          </Section>

          <Section style={buttonContainer}>
            <Link href={resetUrl} style={button}>
              Reset Password
            </Link>
          </Section>

          <Section style={section}>
            <Text style={smallText}>Or copy this link into your browser:</Text>
            <Text style={linkText}>{resetUrl}</Text>
            <Text style={smallText}>This link expires in 1 hour.</Text>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              If you didn&apos;t request a password reset, you can safely ignore
              this email. Your password will not be changed.
            </Text>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} {storeName}
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
  fontSize: "28px",
  fontWeight: "700",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "#1c1917",
  margin: "0",
  textAlign: "center" as const,
};

const divider = {
  borderTop: "1px solid #e5e7eb",
  margin: "0",
};

const section = {
  padding: "20px 24px",
};

const sectionTitle = {
  fontSize: "15px",
  fontWeight: "600",
  color: "#1c1917",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
  margin: "0 0 12px",
};

const paragraph = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#44403c",
  margin: "8px 0",
};

const smallText = {
  fontSize: "13px",
  color: "#78716c",
  margin: "6px 0",
};

const linkText = {
  fontSize: "12px",
  color: "#1c1917",
  wordBreak: "break-all" as const,
  margin: "4px 0",
};

const buttonContainer = {
  textAlign: "center" as const,
  padding: "8px 24px 16px",
};

const button = {
  backgroundColor: "#1c1917",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: "600",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  textDecoration: "none",
  padding: "14px 32px",
  display: "inline-block",
};

const footer = {
  padding: "20px 24px",
  textAlign: "center" as const,
};

const footerText = {
  fontSize: "12px",
  color: "#a8a29e",
  margin: "4px 0",
};
