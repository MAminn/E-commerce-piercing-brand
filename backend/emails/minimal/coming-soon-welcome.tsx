import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
// NEVER REMOVE THIS IMPORT
import * as React from "react";

interface ComingSoonWelcomeProps {
  storeName: string;
}

export const ComingSoonWelcomeTemplate = ({
  storeName,
}: ComingSoonWelcomeProps) => {
  return (
    <Html>
      <Head>
        <title>Welcome to {storeName}</title>
        <Preview>You're here early — and we love that.</Preview>
      </Head>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={header}>
            <Heading as="h1" style={logoText}>
              {storeName}
            </Heading>
          </Section>

          <Hr style={divider} />

          <Section style={section}>
            <Text style={paragraph}>
              So you're here early, we love that.
            </Text>
            <Text style={paragraph}>
              You just secured your spot .. and your 15% off.
            </Text>
            <Text style={paragraph}>
              We're almost ready to show you what we've been building, and honestly we can't wait.
            </Text>
            <Text style={paragraph}>
              Your time matters to us.
            </Text>
            <Text style={paragraph}>
              So the wait won't be long.
            </Text>
            <Text style={paragraph}>
              Welcome to synt..
            </Text>
            <Text style={signature}>
              —Synt team
            </Text>
          </Section>

          <Hr style={divider} />

          <Section style={footer}>
            <Text style={footerText}>
              © {new Date().getFullYear()} {storeName}. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main: React.CSSProperties = {
  backgroundColor: "#f9f9f7",
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

const container: React.CSSProperties = {
  maxWidth: "580px",
  margin: "40px auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e8e5e0",
};

const header: React.CSSProperties = {
  padding: "32px 40px 24px",
  textAlign: "center",
};


const logoText: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "300",
  letterSpacing: "4px",
  color: "#1a1a1a",
  textTransform: "uppercase" as const,
  margin: "0",
};

const divider: React.CSSProperties = {
  borderColor: "#e8e5e0",
  margin: "0",
};

const section: React.CSSProperties = {
  padding: "32px 40px",
};

const paragraph: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.7",
  color: "#4a4a4a",
  margin: "0 0 12px",
};

const signature: React.CSSProperties = {
  fontSize: "15px",
  lineHeight: "1.7",
  color: "#1a1a1a",
  fontStyle: "italic",
  margin: "16px 0 0",
};

const footer: React.CSSProperties = {
  padding: "20px 40px",
  backgroundColor: "#f9f9f7",
};

const footerText: React.CSSProperties = {
  fontSize: "12px",
  color: "#9a9a9a",
  textAlign: "center",
  margin: "0",
};
