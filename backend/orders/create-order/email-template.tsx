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

export const NewOrderEmailTemplate = ({
  items,
  shippingFees,
  subTotal,
  address,
  city,
  country,
  customerEmail,
  customerName,
  customerPhone,
  postalCode,
  state,
  total,
}: {
  items: {
    name: string;
    quantity: number;
    price: number;
    vendorName?: string;
    id?: string;
    discountPrice?: number;
  }[];
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
}) => {
  // Format currency function
  const formatPrice = (price: number) => {
    return price.toFixed(2);
  };

  return (
    <Html>
      <Head>
        <title>Your Order Confirmation</title>
        <Preview>Thank you for your order at Lebsy!</Preview>
      </Head>
      <Body style={main}>
        {/* Header */}
        <Container style={container}>
          <Section style={header}>
            <Row>
              <Column>
                <Heading as='h1' style={logo}>
                  Lebsy
                </Heading>
              </Column>
              <Column style={headerRight}>
                <Text style={headerText}>Order Confirmation</Text>
              </Column>
            </Row>
          </Section>

          <Hr style={divider} />

          {/* Introduction */}
          <Section style={section}>
            <Text style={paragraph}>Dear {customerName},</Text>
            <Text style={paragraph}>
              Thank you for your purchase. We're currently processing your order
              and will keep you updated on its status.
            </Text>
          </Section>

          {/* Order Summary */}
          <Section style={section}>
            <Heading as='h2' style={sectionTitle}>
              Order Summary
            </Heading>
            <Row style={tableHeaderRow}>
              <Column style={tableHeaderCell}>Item</Column>
              <Column style={tableHeaderCell}>Quantity</Column>
              <Column style={tableHeaderCellRight}>Price</Column>
            </Row>

            {items.map((item) => (
              <React.Fragment
                key={item.id || `item-${item.name}-${item.price}`}>
                <Row style={tableRow}>
                  <Column style={tableCell}>{item.name}</Column>
                  <Column style={tableCell}>{item.quantity}</Column>
                  <Column style={tableCellRight}>
                    {item.discountPrice ? (
                      <>
                        <span
                          style={{
                            textDecoration: "line-through",
                            color: "#888",
                          }}>
                          {formatPrice(item.price)} EGP
                        </span>
                        <br />
                        <span style={{ color: "#e53e3e" }}>
                          {formatPrice(item.discountPrice)} EGP
                        </span>
                      </>
                    ) : (
                      <>{formatPrice(item.price)} EGP</>
                    )}
                  </Column>
                </Row>
              </React.Fragment>
            ))}

            <Row style={summaryRow}>
              <Column style={summaryLabelCell} colSpan={2}>
                Subtotal
              </Column>
              <Column style={summaryValueCell}>
                {formatPrice(subTotal)} EGP
              </Column>
            </Row>
            <Row style={summaryRow}>
              <Column style={summaryLabelCell} colSpan={2}>
                Shipping
              </Column>
              <Column style={summaryValueCell}>
                {formatPrice(shippingFees)} EGP
              </Column>
            </Row>
            <Row style={totalRow}>
              <Column style={totalLabelCell} colSpan={2}>
                Total
              </Column>
              <Column style={totalValueCell}>{formatPrice(total)} EGP</Column>
            </Row>
          </Section>

          {/* Shipping Address */}
          <Section style={section}>
            <Heading as='h2' style={sectionTitle}>
              Shipping Address
            </Heading>
            <Row>
              <Column style={infoLabelCell}>Address:</Column>
              <Column style={infoValueCell}>{address}</Column>
            </Row>
            <Row>
              <Column style={infoLabelCell}>City:</Column>
              <Column style={infoValueCell}>{city}</Column>
            </Row>
            {state && state.trim() ? (
              <Row>
                <Column style={infoLabelCell}>State:</Column>
                <Column style={infoValueCell}>{state}</Column>
              </Row>
            ) : null}
            {postalCode && postalCode.trim() ? (
              <Row>
                <Column style={infoLabelCell}>Postal Code:</Column>
                <Column style={infoValueCell}>{postalCode}</Column>
              </Row>
            ) : null}
            <Row>
              <Column style={infoLabelCell}>Country:</Column>
              <Column style={infoValueCell}>{country}</Column>
            </Row>
          </Section>

          {/* Customer Information */}
          <Section style={section}>
            <Heading as='h2' style={sectionTitle}>
              Customer Information
            </Heading>
            <Row>
              <Column style={infoLabelCell}>Name:</Column>
              <Column style={infoValueCell}>{customerName}</Column>
            </Row>
            <Row>
              <Column style={infoLabelCell}>Email:</Column>
              <Column style={infoValueCell}>{customerEmail}</Column>
            </Row>
            <Row>
              <Column style={infoLabelCell}>Phone:</Column>
              <Column style={infoValueCell}>{customerPhone}</Column>
            </Row>
          </Section>

          <Hr style={divider} />

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              If you have any questions about your order, please contact our
              customer service team at
              <Link href='mailto:support@lebsy.com' style={link}>
                {" "}
                support@lebsy.com
              </Link>
              .
            </Text>
            <Text style={footerText}>
              © {new Date().getFullYear()} Lebsy. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Email-safe CSS styles as objects
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  padding: "20px 0",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px",
  maxWidth: "600px",
  borderRadius: "8px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
};

const header = {
  padding: "10px 0 20px",
};

const headerRight = {
  textAlign: "right" as const,
};

const headerText = {
  fontSize: "16px",
  color: "#666",
  margin: "20px 0 0",
};

const logo = {
  color: "#021E43",
  fontSize: "26px",
  fontWeight: "bold",
  margin: "10px 0",
};

const divider = {
  borderTop: "1px solid #e5e7eb",
  margin: "20px 0",
};

const section = {
  padding: "10px 0",
};

const sectionTitle = {
  fontSize: "18px",
  color: "#021E43",
  fontWeight: "600",
  margin: "10px 0",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "24px",
  color: "#333",
  margin: "10px 0",
};

const tableHeaderRow = {
  borderBottom: "2px solid #e5e7eb",
};

const tableHeaderCell = {
  fontSize: "14px",
  color: "#666",
  textAlign: "left" as const,
  padding: "10px 5px",
  fontWeight: "600",
};

const tableHeaderCellRight = {
  fontSize: "14px",
  color: "#666",
  textAlign: "right" as const,
  padding: "10px 5px",
  fontWeight: "600",
};

const tableRow = {
  borderBottom: "1px solid #f0f0f0",
};

const tableCell = {
  fontSize: "14px",
  color: "#333",
  padding: "10px 5px",
  textAlign: "left" as const,
};

const tableCellRight = {
  fontSize: "14px",
  color: "#333",
  padding: "10px 5px",
  textAlign: "right" as const,
};

const vendorRow = {
  backgroundColor: "#f9f9f9",
};

const vendorCell = {
  fontSize: "12px",
  color: "#666",
  padding: "5px",
  fontStyle: "italic",
};

const summaryRow = {
  backgroundColor: "#fbfbfb",
};

const summaryLabelCell = {
  fontSize: "14px",
  padding: "10px 5px",
  textAlign: "right" as const,
  fontWeight: "500",
  color: "#555",
};

const summaryValueCell = {
  fontSize: "14px",
  padding: "10px 5px",
  textAlign: "right" as const,
  fontWeight: "500",
  color: "#333",
};

const totalRow = {
  backgroundColor: "#f0f6ff",
  borderTop: "2px solid #d0e0ff",
  borderBottom: "2px solid #d0e0ff",
};

const totalLabelCell = {
  fontSize: "16px",
  padding: "12px 5px",
  textAlign: "right" as const,
  fontWeight: "bold",
  color: "#021E43",
};

const totalValueCell = {
  fontSize: "16px",
  padding: "12px 5px",
  textAlign: "right" as const,
  fontWeight: "bold",
  color: "#021E43",
};

const infoTable = {
  width: "100%",
};

const infoLabelCell = {
  fontSize: "14px",
  color: "#666",
  padding: "5px 10px 5px 0",
  verticalAlign: "top",
  width: "120px",
  fontWeight: "600",
};

const infoValueCell = {
  fontSize: "14px",
  color: "#333",
  padding: "5px 0",
  verticalAlign: "top",
};

const footer = {
  textAlign: "center" as const,
  padding: "20px 0 0",
};

const footerText = {
  fontSize: "12px",
  color: "#777",
  margin: "5px 0",
};

const link = {
  color: "#021E43",
  textDecoration: "none",
};
