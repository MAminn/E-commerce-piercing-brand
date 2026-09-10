import {
  Body,
  Container,
  Column,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
// NEVER REMOVE THIS IMPORT
import * as React from "react";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  vendorName?: string;
  id?: string;
  discountPrice?: number;
}

interface MinimalOrderEmailProps {
  storeName: string;
  logoUrl?: string;
  contactEmail?: string;
  currency: string;
  items: OrderItem[];
  shippingFees: number;
  subTotal: number;
  total: number;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

export const MinimalOrderEmailTemplate = ({
  storeName,
  logoUrl,
  contactEmail,
  currency,
  items,
  shippingFees,
  subTotal,
  total,
  address,
  city,
  state,
  postalCode,
  country,
  customerName,
  customerEmail,
  customerPhone,
}: MinimalOrderEmailProps) => {
  const fmt = (price: number) => price.toFixed(2);

  return (
    <Html>
      <Head>
        <title>Your Order Confirmation</title>
        <Preview>Thank you for your order at {storeName}!</Preview>
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

          {/* Greeting */}
          <Section style={section}>
            <Heading as="h2" style={sectionTitle}>
              Order Confirmation
            </Heading>
            <Text style={paragraph}>Dear {customerName},</Text>
            <Text style={paragraph}>
              Thank you for your purchase at {storeName}. We&apos;re currently
              processing your order and will keep you updated on its status.
            </Text>
          </Section>

          {/* Order Summary */}
          <Section style={section}>
            <Heading as="h3" style={sectionTitle}>
              Order Summary
            </Heading>
            <Row style={tableHeaderRow}>
              <Column style={tableHeaderCell}>Item</Column>
              <Column style={tableHeaderCell}>Qty</Column>
              <Column style={tableHeaderCellRight}>Price</Column>
            </Row>

            {items.map((item) => (
              <React.Fragment key={item.id || `${item.name}-${item.price}`}>
                <Row style={tableRow}>
                  <Column style={tableCell}>{item.name}</Column>
                  <Column style={tableCell}>{item.quantity}</Column>
                  <Column style={tableCellRight}>
                    {item.discountPrice ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: "#999" }}>
                          {fmt(item.price)} {currency}
                        </span>
                        <br />
                        <span style={{ color: "#b91c1c" }}>
                          {fmt(item.discountPrice)} {currency}
                        </span>
                      </>
                    ) : (
                      <>
                        {fmt(item.price)} {currency}
                      </>
                    )}
                  </Column>
                </Row>
              </React.Fragment>
            ))}

            <Row style={summaryRow}>
              <Column style={summaryLabel} colSpan={2}>
                Subtotal
              </Column>
              <Column style={summaryValue}>
                {fmt(subTotal)} {currency}
              </Column>
            </Row>
            <Row style={summaryRow}>
              <Column style={summaryLabel} colSpan={2}>
                Shipping
              </Column>
              <Column style={summaryValue}>
                {fmt(shippingFees)} {currency}
              </Column>
            </Row>
            <Row style={totalRow}>
              <Column style={totalLabel} colSpan={2}>
                Total
              </Column>
              <Column style={totalValue}>
                {fmt(total)} {currency}
              </Column>
            </Row>
          </Section>

          {/* Shipping Address */}
          <Section style={section}>
            <Heading as="h3" style={sectionTitle}>
              Shipping Address
            </Heading>
            <Text style={infoText}>
              {address}
              <br />
              {city}, {state} {postalCode}
              <br />
              {country}
            </Text>
          </Section>

          {/* Customer Info */}
          <Section style={section}>
            <Heading as="h3" style={sectionTitle}>
              Customer Information
            </Heading>
            <Text style={infoText}>
              {customerName}
              <br />
              {customerEmail}
              <br />
              {customerPhone}
            </Text>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            {contactEmail && (
              <Text style={footerText}>
                Questions? Contact us at{" "}
                <Link href={`mailto:${contactEmail}`} style={link}>
                  {contactEmail}
                </Link>
              </Text>
            )}
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} {storeName}. All rights reserved.
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

const tableHeaderRow = {
  borderBottom: "2px solid #e5e7eb",
};

const tableHeaderCell = {
  fontSize: "11px",
  fontWeight: "600",
  color: "#78716c",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  padding: "8px 4px",
  textAlign: "left" as const,
};

const tableHeaderCellRight = {
  ...tableHeaderCell,
  textAlign: "right" as const,
};

const tableRow = {
  borderBottom: "1px solid #f5f5f4",
};

const tableCell = {
  fontSize: "14px",
  color: "#1c1917",
  padding: "10px 4px",
  textAlign: "left" as const,
};

const tableCellRight = {
  ...tableCell,
  textAlign: "right" as const,
};

const summaryRow = {};

const summaryLabel = {
  fontSize: "13px",
  padding: "6px 4px",
  textAlign: "right" as const,
  color: "#78716c",
};

const summaryValue = {
  fontSize: "13px",
  padding: "6px 4px",
  textAlign: "right" as const,
  color: "#1c1917",
};

const totalRow = {
  borderTop: "2px solid #1c1917",
};

const totalLabel = {
  fontSize: "15px",
  fontWeight: "700",
  padding: "12px 4px",
  textAlign: "right" as const,
  color: "#1c1917",
};

const totalValue = {
  fontSize: "15px",
  fontWeight: "700",
  padding: "12px 4px",
  textAlign: "right" as const,
  color: "#1c1917",
};

const infoText = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#44403c",
  margin: "0",
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

const link = {
  color: "#1c1917",
  textDecoration: "underline",
};
