import {
  Body,
  Column,
  Container,
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
import { formatMoney, type MoneyLocale } from "#root/shared/pricing/format-money";
import { fromMinorUnits } from "#root/shared/bundles/evaluate";
import type {
  OrderEmailLine,
  OrderEmailModel,
  OrderEmailOption,
} from "#root/backend/orders/order-emails/model";
import type { ReturnsPolicyLine } from "#root/shared/legal/return-policy-content";

/*
 * Customer order confirmation — English, then Arabic.
 *
 * Both sections render the SAME model (backend/orders/order-emails/model.ts),
 * so the order number, every amount and every product name are identical in
 * the two languages; only the fixed copy below is translated. The copy is
 * static, reviewed text — nothing is machine-translated at send time.
 * Product and option names are printed exactly as stored (they exist only in
 * English). Amounts use the store formatter: "EGP 760" / "760 ج.م." with
 * Latin digits in both, matching the storefront's Arabic UI.
 */

export interface OrderConfirmationEmailProps {
  order: OrderEmailModel;
  storeName: string;
  logoUrl?: string;
  supportEmail?: string;
  whatsappDisplay: string;
  whatsappUrl: string;
  websiteUrl: string;
  websiteLabel: string;
  returns: { lines: ReturnsPolicyLine[]; policyUrl?: string };
}

type Lang = "en" | "ar";

const COPY = {
  en: {
    heading: "Order confirmed",
    greeting: (name: string, store: string) =>
      `Hi ${name}, thank you for your order from ${store}. Here are your order details.`,
    orderNumber: "Order number",
    orderDate: "Order date",
    payment: "Payment",
    cod: "Cash on delivery",
    paidOnline: "Paid online",
    yourOrder: "Your order",
    setPieces: (n: number) => `Set · ${n} ${n === 1 ? "piece" : "pieces"}`,
    qty: "Qty",
    subtotal: "Subtotal",
    discount: "Discount",
    discountWithCode: (code: string) => `Discount (code ${code})`,
    promoApplied: (code: string) => `Promo code ${code} applied`,
    shipping: "Shipping",
    free: "Free",
    adjustment: "Adjustment",
    total: "Total",
    codNote: (amount: string) =>
      `Cash on delivery: please have ${amount} ready to pay when your order arrives.`,
    paidNote: "Your payment has been received — there is nothing to pay on delivery.",
    delivery: "Delivery details",
    phone: "Phone",
    returns: "Returns",
    returnsLink: "Read our returns policy",
    help: "Need help?",
    whatsapp: "WhatsApp",
    email: "Email",
    website: "Website",
    mentionOrder: (n: string) => `Please include your order number ${n} when you contact us.`,
  },
  ar: {
    heading: "تم تأكيد طلبك",
    greeting: (name: string, store: string) =>
      `مرحبًا ${name}، شكرًا لطلبك من ${store}. إليك تفاصيل طلبك.`,
    orderNumber: "رقم الطلب",
    orderDate: "تاريخ الطلب",
    payment: "طريقة الدفع",
    cod: "الدفع عند الاستلام",
    paidOnline: "تم الدفع أونلاين",
    yourOrder: "طلبك",
    // Same agreement as the storefront's cart.item_count_* strings.
    setPieces: (n: number) =>
      `طقم · ${n === 1 ? "قطعة واحدة" : n === 2 ? "قطعتان" : n <= 10 ? `${n} قطع` : `${n} قطعة`}`,
    qty: "الكمية",
    subtotal: "المجموع الفرعي",
    discount: "الخصم",
    discountWithCode: (code: string) => `الخصم (كود ${code})`,
    promoApplied: (code: string) => `تم تطبيق كود الخصم ${code}`,
    shipping: "الشحن",
    free: "مجاني",
    adjustment: "تعديل",
    total: "الإجمالي",
    codNote: (amount: string) =>
      `الدفع عند الاستلام: يُرجى تجهيز مبلغ ${amount} للدفع عند وصول طلبك.`,
    paidNote: "تم استلام الدفع — لا يوجد مبلغ مطلوب عند الاستلام.",
    delivery: "بيانات التوصيل",
    phone: "رقم الهاتف",
    returns: "سياسة الإرجاع",
    returnsLink: "اقرأ سياسة الإرجاع",
    help: "تحتاج مساعدة؟",
    whatsapp: "واتساب",
    email: "البريد الإلكتروني",
    website: "الموقع الإلكتروني",
    mentionOrder: (n: string) => `يُرجى ذكر رقم الطلب ${n} عند التواصل معنا.`,
  },
} as const;

const money = (minorAmount: number, lang: Lang) =>
  formatMoney(fromMinorUnits(minorAmount), { locale: lang as MoneyLocale });

/** Calendar date of the order in Cairo, e.g. "18 October 2026" / "18 أكتوبر 2026". */
export function formatOrderDate(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    timeZone: "Africa/Cairo",
    dateStyle: "long",
  }).format(date);
}

const optionsText = (options: OrderEmailOption[]) =>
  options.map((o) => `${o.name}: ${o.value}`).join(" · ");

/** Subject line — both languages, order number first so it is findable. */
export function orderConfirmationSubject(order: OrderEmailModel, storeName: string): string {
  const ref = order.orderNumber ? ` ${order.orderNumber}` : "";
  return `${storeName} order${ref} confirmed | تم تأكيد طلبك`;
}

export const OrderConfirmationEmail = (props: OrderConfirmationEmailProps) => {
  const { order, storeName, logoUrl, websiteUrl, websiteLabel } = props;
  const preview = `${COPY.en.heading} ${order.orderNumber} — ${money(order.totals.totalMinor, "en")}`;

  return (
    <Html lang="en">
      <Head>
        <title>{`${COPY.en.heading} ${order.orderNumber}`}</title>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            {logoUrl ? (
              <Img
                src={logoUrl}
                alt={storeName}
                height="40"
                style={{ margin: "0 auto", display: "block", objectFit: "contain", maxWidth: "180px" }}
              />
            ) : (
              <Heading as="h1" style={wordmark}>
                {storeName.toLowerCase()}
              </Heading>
            )}
          </Section>

          <LanguageSection lang="en" {...props} />

          <Section style={languageDivider}>
            <Text style={languageDividerText}>العربية</Text>
          </Section>

          <LanguageSection lang="ar" {...props} />

          <Hr style={rule} />
          <Section style={footer}>
            <Text style={footerText}>
              <Link href={websiteUrl} style={footerLink}>
                {websiteLabel}
              </Link>
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

function LanguageSection({
  lang,
  order,
  storeName,
  supportEmail,
  whatsappDisplay,
  whatsappUrl,
  websiteUrl,
  websiteLabel,
  returns,
}: OrderConfirmationEmailProps & { lang: Lang }) {
  const t = COPY[lang];
  const rtl = lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const end = rtl ? "left" : "right";
  const { totals } = order;
  const totalLabel = money(totals.totalMinor, lang);

  return (
    <Section dir={dir} lang={lang} style={{ ...section, direction: dir, textAlign: align }} data-lang={lang}>
      <Heading as="h2" style={{ ...h2, textAlign: align }}>
        {t.heading}
      </Heading>
      <Text style={{ ...paragraph, textAlign: align }}>{t.greeting(order.customerName, storeName)}</Text>

      {/* Order facts */}
      <Section dir={dir} style={factsBox}>
        <FactRow dir={dir} align={align} end={end} label={t.orderNumber} value={order.orderNumber} strong />
        <FactRow dir={dir} align={align} end={end} label={t.orderDate} value={formatOrderDate(order.createdAt, lang)} />
        <FactRow
          dir={dir}
          align={align}
          end={end}
          label={t.payment}
          value={order.payment.isCashOnDelivery ? t.cod : t.paidOnline}
        />
      </Section>

      {/* Items */}
      <Heading as="h3" style={{ ...h3, textAlign: align }}>
        {t.yourOrder}
      </Heading>
      {order.lines.map((line) => (
        <ItemRow key={`${lang}-${line.key}`} line={line} lang={lang} dir={dir} align={align} end={end} />
      ))}

      {/* Totals */}
      <Section dir={dir} style={totalsBox}>
        <TotalRow dir={dir} align={align} end={end} label={t.subtotal} value={money(totals.subtotalMinor, lang)} kind="subtotal" />
        {totals.discountMinor > 0 && (
          <TotalRow
            dir={dir}
            align={align}
            end={end}
            label={order.promoCode ? t.discountWithCode(order.promoCode) : t.discount}
            value={`−${money(totals.discountMinor, lang)}`}
            kind="discount"
          />
        )}
        {totals.discountMinor === 0 && order.promoCode && (
          <TotalRow dir={dir} align={align} end={end} label={t.promoApplied(order.promoCode)} value="" kind="promo" />
        )}
        {totals.adjustmentMinor > 0 && (
          <TotalRow
            dir={dir}
            align={align}
            end={end}
            label={t.adjustment}
            value={`+${money(totals.adjustmentMinor, lang)}`}
            kind="adjustment"
          />
        )}
        <TotalRow
          dir={dir}
          align={align}
          end={end}
          label={t.shipping}
          value={totals.shippingMinor === 0 ? t.free : money(totals.shippingMinor, lang)}
          kind="shipping"
        />
        <TotalRow dir={dir} align={align} end={end} label={t.total} value={totalLabel} grand kind="total" />
      </Section>

      <Text style={{ ...callout, textAlign: align }}>
        {order.payment.isCashOnDelivery ? t.codNote(totalLabel) : t.paidNote}
      </Text>

      {/* Delivery */}
      <Heading as="h3" style={{ ...h3, textAlign: align }}>
        {t.delivery}
      </Heading>
      <Text style={{ ...infoText, textAlign: align }}>
        {order.customerName}
        <br />
        {order.delivery.address}
        <br />
        {[order.delivery.city, rtl ? order.delivery.governorateAr : order.delivery.governorateEn]
          .filter(Boolean)
          .join(rtl ? "، " : ", ")}
        <br />
        {t.phone}: <span dir="ltr">{order.customerPhone}</span>
      </Text>

      {/* Returns */}
      <Heading as="h3" style={{ ...h3, textAlign: align }}>
        {t.returns}
      </Heading>
      {returns.lines.map((line) => (
        <Text key={`${lang}-ret-${line.en}`} style={{ ...bullet, textAlign: align }} data-returns-line="">
          • {rtl ? line.ar : line.en}
        </Text>
      ))}
      {returns.policyUrl && (
        <Text style={{ ...paragraph, textAlign: align }}>
          <Link href={returns.policyUrl} style={link}>
            {t.returnsLink}
          </Link>
        </Text>
      )}

      {/* Contact */}
      <Heading as="h3" style={{ ...h3, textAlign: align }}>
        {t.help}
      </Heading>
      <Text style={{ ...infoText, textAlign: align }}>
        {t.whatsapp}:{" "}
        <Link href={whatsappUrl} style={link}>
          <span dir="ltr">{whatsappDisplay}</span>
        </Link>
        {supportEmail && (
          <>
            <br />
            {t.email}:{" "}
            <Link href={`mailto:${supportEmail}`} style={link}>
              {supportEmail}
            </Link>
          </>
        )}
        <br />
        {t.website}:{" "}
        <Link href={websiteUrl} style={link}>
          {websiteLabel}
        </Link>
      </Text>
      {order.orderNumber && (
        <Text style={{ ...muted, textAlign: align }}>{t.mentionOrder(order.orderNumber)}</Text>
      )}
    </Section>
  );
}

interface RowLayout {
  dir: "ltr" | "rtl";
  align: "left" | "right";
  end: "left" | "right";
}

function FactRow({
  dir,
  align,
  end,
  label,
  value,
  strong,
}: RowLayout & { label: string; value: string; strong?: boolean }) {
  return (
    <Row dir={dir}>
      <Column style={{ ...factLabel, textAlign: align }}>{label}</Column>
      <Column style={{ ...factValue, textAlign: end, fontWeight: strong ? 700 : 500 }}>{value}</Column>
    </Row>
  );
}

function TotalRow({
  dir,
  align,
  end,
  label,
  value,
  grand,
  kind,
}: RowLayout & { label: string; value: string; grand?: boolean; kind: string }) {
  const cell = grand ? totalCellGrand : totalCell;
  return (
    <Row dir={dir} style={grand ? grandRow : undefined} data-total={kind}>
      <Column style={{ ...cell, textAlign: align }}>{label}</Column>
      <Column style={{ ...cell, textAlign: end }}>{value}</Column>
    </Row>
  );
}

function ItemRow({ line, lang, dir, align, end }: RowLayout & { line: OrderEmailLine; lang: Lang }) {
  const t = COPY[lang];
  const pieceCount = line.children.reduce((sum, c) => sum + c.quantity, 0);
  return (
    <Section dir={dir} style={itemBox}>
      <Row dir={dir}>
        <Column style={thumbCell}>
          {line.imageUrl ? (
            <Img src={line.imageUrl} alt="" width="56" height="56" style={thumb} />
          ) : (
            <div style={thumbPlaceholder} />
          )}
        </Column>
        <Column style={{ ...itemMain, textAlign: align }}>
          <Text style={itemName}>{line.name}</Text>
          {line.kind === "set" && <Text style={itemMeta}>{t.setPieces(pieceCount)}</Text>}
          {line.options.length > 0 && <Text style={itemMeta}>{optionsText(line.options)}</Text>}
          {line.children.map((child) => (
            <Text key={child.key} style={itemMeta}>
              {`${child.quantity} × ${child.name}`}
              {child.options.length > 0 ? ` — ${optionsText(child.options)}` : ""}
            </Text>
          ))}
          <Text style={itemMeta}>
            {`${t.qty}: ${line.quantity} × `}
            {line.regularUnitPriceMinor !== undefined && (
              <>
                <span style={strike}>{money(line.regularUnitPriceMinor, lang)}</span>{" "}
              </>
            )}
            {money(line.unitPriceMinor, lang)}
          </Text>
        </Column>
        <Column style={{ ...itemTotal, textAlign: end }}>{money(line.lineTotalMinor, lang)}</Column>
      </Row>
    </Section>
  );
}

// ─── Styles (Percé palette: Ground #0E0E0E, Paper #F2F0ED, Muted #8A8785) ───

const main = {
  backgroundColor: "#F2F0ED",
  fontFamily: "'Inter Tight', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: "24px 0",
};
const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  maxWidth: "600px",
  width: "100%",
  border: "1px solid #DAD7D3",
};
const header = { padding: "28px 24px 12px", textAlign: "center" as const };
const wordmark = {
  fontSize: "30px",
  fontWeight: 600,
  letterSpacing: "-0.02em",
  color: "#0E0E0E",
  margin: 0,
  textAlign: "center" as const,
};
const section = { padding: "8px 24px 20px" };
const h2 = { fontSize: "22px", fontWeight: 600, color: "#0E0E0E", margin: "12px 0 8px" };
const h3 = { fontSize: "15px", fontWeight: 600, color: "#0E0E0E", margin: "22px 0 8px" };
const paragraph = { fontSize: "14px", lineHeight: "22px", color: "#2A2A2A", margin: "6px 0" };
const muted = { fontSize: "13px", lineHeight: "20px", color: "#5F5C5A", margin: "8px 0 0" };
const infoText = { fontSize: "14px", lineHeight: "22px", color: "#2A2A2A", margin: 0 };
const bullet = { fontSize: "14px", lineHeight: "22px", color: "#2A2A2A", margin: "2px 0" };
const link = { color: "#0E0E0E", textDecoration: "underline" };
const factsBox = { backgroundColor: "#F2F0ED", padding: "10px 14px", margin: "14px 0 4px" };
const factLabel = { fontSize: "13px", color: "#5F5C5A", padding: "4px 0" };
const factValue = { fontSize: "14px", color: "#0E0E0E", padding: "4px 0" };
const itemBox = { borderBottom: "1px solid #EDEBE8", padding: "10px 0" };
const thumbCell = { width: "64px", verticalAlign: "top" as const };
const thumb = { display: "block", objectFit: "cover" as const, backgroundColor: "#F2F0ED" };
const thumbPlaceholder = { width: "56px", height: "56px", backgroundColor: "#F2F0ED" };
const itemMain = { verticalAlign: "top" as const, padding: "0 8px" };
const itemName = { fontSize: "14px", fontWeight: 600, color: "#0E0E0E", margin: "0 0 2px", lineHeight: "20px" };
const itemMeta = { fontSize: "13px", color: "#5F5C5A", margin: "0", lineHeight: "19px" };
const itemTotal = {
  verticalAlign: "top" as const,
  fontSize: "14px",
  fontWeight: 600,
  color: "#0E0E0E",
  whiteSpace: "nowrap" as const,
  width: "96px",
};
const strike = { textDecoration: "line-through", color: "#8A8785" };
const totalsBox = { margin: "10px 0 0" };
const totalCell = { fontSize: "14px", color: "#2A2A2A", padding: "4px 0" };
const totalCellGrand = { fontSize: "16px", fontWeight: 700, color: "#0E0E0E", padding: "10px 0 4px" };
const grandRow = { borderTop: "2px solid #0E0E0E" };
const callout = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#0E0E0E",
  backgroundColor: "#F2F0ED",
  padding: "10px 14px",
  margin: "14px 0 0",
};
const languageDivider = { padding: "4px 24px", borderTop: "1px solid #DAD7D3" };
const languageDividerText = {
  fontSize: "12px",
  color: "#8A8785",
  textAlign: "center" as const,
  margin: "8px 0 0",
  letterSpacing: "0.04em",
};
const rule = { borderTop: "1px solid #DAD7D3", margin: 0 };
const footer = { padding: "16px 24px 20px", textAlign: "center" as const };
const footerText = { fontSize: "12px", color: "#8A8785", margin: "2px 0" };
const footerLink = { color: "#5F5C5A", textDecoration: "underline" };
