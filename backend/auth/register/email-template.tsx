import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
// NEVER REMOVE THIS IMPORT
import * as React from "react";

export const EmailVerificationTemplate = ({
  userName,
  verificationUrl,
}: {
  userName: string;
  verificationUrl: string;
}) => {
  return (
    <Html>
      <Head>
        <title>Lebsy Account Verification</title>
        <Preview>Verify your email for Lebsy</Preview>
      </Head>
      <Body style={main}>
        <Container style={container}>
          <Heading as="h1" style={logo}>
            Lebsy
          </Heading>

          <Section style={section}>
            <Heading as="h2" style={sectionTitle}>
              Verify Your Email
            </Heading>
            <Text style={paragraph}>Hello {userName},</Text>
            <Text style={paragraph}>
              Please click the button below to verify your email address:
            </Text>
          </Section>

          <Section style={buttonContainer}>
            <Link href={verificationUrl} style={button}>
              Verify My Email
            </Link>
          </Section>

          <Section style={section}>
            <Text style={paragraph}>Or copy this link into your browser:</Text>
            <Text style={linkText}>{verificationUrl}</Text>
            <Text style={paragraph}>This link expires in 24 hours.</Text>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              If you didn't sign up for Lebsy, please ignore this email.
            </Text>
            <Text style={footerText}>© {new Date().getFullYear()} Lebsy</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Styles
const main = {
  backgroundColor: "#f5f5f5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  padding: "20px 0",
};

const container = {
  margin: "0 auto",
  backgroundColor: "#ffffff",
  borderRadius: "5px",
  overflow: "hidden",
  maxWidth: "600px",
};

const logo = {
  color: "#1B4571",
  fontSize: "32px",
  fontWeight: "bold",
  textAlign: "center" as const,
  margin: "30px 0 20px",
  padding: "0 20px",
};

const section = {
  padding: "0 20px",
};

const sectionTitle = {
  fontSize: "24px",
  fontWeight: "bold",
  margin: "30px 0 15px",
  color: "#333",
};

const paragraph = {
  margin: "10px 0",
  fontSize: "16px",
  lineHeight: "1.5",
  color: "#3a3a3a",
};

const linkText = {
  fontSize: "14px",
  color: "#1B4571",
  wordBreak: "break-all" as const,
};

const buttonContainer = {
  textAlign: "center" as const,
  padding: "20px 0",
};

const button = {
  backgroundColor: "#1B4571",
  borderRadius: "5px",
  color: "#fff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "bold",
  margin: "0 auto",
  padding: "12px 25px",
  textDecoration: "none",
};

const divider = {
  borderTop: "1px solid #e5e5e5",
  margin: "30px 0",
};

const footer = {
  textAlign: "center" as const,
  padding: "0 20px 30px",
};

const footerText = {
  fontSize: "14px",
  color: "#747474",
  margin: "5px 0",
};
