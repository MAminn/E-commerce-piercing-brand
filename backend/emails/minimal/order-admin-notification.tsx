import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
// NEVER REMOVE THIS IMPORT
import * as React from "react";
import { formatMoney } from "#root/shared/pricing/format-money";
import { fromMinorUnits } from "#root/shared/bundles/evaluate";
import type { OrderEmailModel } from "#root/backend/orders/order-emails/model";

/*
 * Store-side "new order" notification. Deliberately NOT the customer email:
 * no greeting, no thank-you, no returns copy — just what the team needs to
 * act on the order, plus a link to it in the dashboard.
 */

export interface OrderAdminNotificationEmailProps {
  order: OrderEmailModel;
  storeName: string;
  dashboardUrl: string;
}

const money = (minorAmount: number) => formatMoney(fromMinorUnits(minorAmount));

export function orderAdminNotificationSubject(order: OrderEmailModel): string {
  const method = order.payment.isCashOnDelivery ? "COD" : "paid online";
  // Plain spaces in a subject line — Intl joins "EGP" and the amount with U+00A0.
  const amount = money(order.totals.totalMinor).replace(/ /g, " ");
  return `New order ${order.orderNumber} — ${amount} (${method})`;
}

export const OrderAdminNotificationEmail = ({
  order,
  storeName,
  dashboardUrl,
}: OrderAdminNotificationEmailProps) => {
  const { totals } = order;
  return (
    <Html lang="en">
      <Head>
        <title>{`New order ${order.orderNumber}`}</title>
      </Head>
      <Preview>{orderAdminNotificationSubject(order)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={section}>
            <Text style={eyebrow}>{storeName} · new order</Text>
            <Heading as="h1" style={h1}>
              {`Order ${order.orderNumber}`}
            </Heading>
            <Text style={meta}>
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Africa/Cairo",
                dateStyle: "medium",
                timeStyle: "short",
              }).format(order.createdAt)}
              {" · "}
              {order.payment.isCashOnDelivery
                ? `Cash on delivery — collect ${money(totals.totalMinor)}`
                : `Paid online (${order.payment.method})`}
            </Text>
          </Section>

          <Section style={section}>
            <Heading as="h2" style={h2}>
              Items
            </Heading>
            {order.lines.map((line) => (
              <Row key={line.key} style={itemRow}>
                <Column style={cell}>
                  <strong>{`${line.quantity} × ${line.name}`}</strong>
                  {line.options.length > 0 && (
                    <>
                      <br />
                      {line.options.map((o) => `${o.name}: ${o.value}`).join(" · ")}
                    </>
                  )}
                  {line.children.map((child) => (
                    <React.Fragment key={child.key}>
                      <br />
                      {`— ${child.quantity} × ${child.name}`}
                      {child.options.length > 0
                        ? ` (${child.options.map((o) => `${o.name}: ${o.value}`).join(", ")})`
                        : ""}
                    </React.Fragment>
                  ))}
                </Column>
                <Column style={cellRight}>{money(line.lineTotalMinor)}</Column>
              </Row>
            ))}
            <Row>
              <Column style={cell}>Subtotal</Column>
              <Column style={cellRight}>{money(totals.subtotalMinor)}</Column>
            </Row>
            {totals.discountMinor > 0 && (
              <Row>
                <Column style={cell}>
                  {order.promoCode ? `Discount (code ${order.promoCode})` : "Discount"}
                </Column>
                <Column style={cellRight}>{`−${money(totals.discountMinor)}`}</Column>
              </Row>
            )}
            {totals.adjustmentMinor > 0 && (
              <Row>
                <Column style={cell}>Adjustment (check this order)</Column>
                <Column style={cellRight}>{`+${money(totals.adjustmentMinor)}`}</Column>
              </Row>
            )}
            <Row>
              <Column style={cell}>Shipping</Column>
              <Column style={cellRight}>
                {totals.shippingMinor === 0 ? "Free" : money(totals.shippingMinor)}
              </Column>
            </Row>
            <Row style={grandRow}>
              <Column style={grandCell}>Total</Column>
              <Column style={{ ...grandCell, textAlign: "right" }}>{money(totals.totalMinor)}</Column>
            </Row>
          </Section>

          <Section style={section}>
            <Heading as="h2" style={h2}>
              Customer
            </Heading>
            <Text style={info}>
              {order.customerName}
              <br />
              {order.customerPhone}
              <br />
              {order.customerEmail}
              <br />
              {order.delivery.address}
              <br />
              {[order.delivery.city, order.delivery.governorateEn].filter(Boolean).join(", ")}
            </Text>
            {order.notes && (
              <Text style={info}>
                <strong>Customer note:</strong> {order.notes}
              </Text>
            )}
          </Section>

          <Hr style={rule} />
          <Section style={section}>
            <Link href={dashboardUrl} style={link}>
              Open orders in the dashboard
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

const main = {
  backgroundColor: "#F2F0ED",
  fontFamily: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "24px 0",
};
const container = { backgroundColor: "#ffffff", margin: "0 auto", maxWidth: "600px", border: "1px solid #DAD7D3" };
const section = { padding: "16px 24px" };
const eyebrow = { fontSize: "12px", color: "#8A8785", margin: 0 };
const h1 = { fontSize: "22px", fontWeight: 600, color: "#0E0E0E", margin: "4px 0" };
const h2 = { fontSize: "14px", fontWeight: 600, color: "#0E0E0E", margin: "0 0 8px" };
const meta = { fontSize: "14px", color: "#2A2A2A", margin: 0 };
const itemRow = { borderBottom: "1px solid #EDEBE8" };
const cell = { fontSize: "14px", color: "#2A2A2A", padding: "6px 0", lineHeight: "20px" };
const cellRight = { ...cell, textAlign: "right" as const, whiteSpace: "nowrap" as const, verticalAlign: "top" as const };
const grandRow = { borderTop: "2px solid #0E0E0E" };
const grandCell = { fontSize: "15px", fontWeight: 700, color: "#0E0E0E", padding: "8px 0" };
const info = { fontSize: "14px", lineHeight: "22px", color: "#2A2A2A", margin: "0 0 8px" };
const link = { color: "#0E0E0E", textDecoration: "underline", fontSize: "14px" };
const rule = { borderTop: "1px solid #DAD7D3", margin: 0 };
