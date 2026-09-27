import type { HomepageLegalPageContent } from "#root/shared/types/homepage-content";

/*
 * Shipped drafts for /terms and /privacy.
 *
 * Both ship DISABLED. Every sentence without a marker describes what this
 * codebase verifiably does today; everything the business itself has to
 * decide or supply — who the seller is, delivery times, cancellations,
 * governing law, retention periods, which outside services are switched on —
 * is an OWNER_INPUT_MARKER placeholder. A page keeps showing "not available
 * yet", and stays out of the footer, until every placeholder is replaced or
 * its section deleted (see isLegalPagePublished in ./legal-pages.ts), so an
 * unfinished draft can never go live by accident.
 *
 * Arabic bodies are deliberately empty: legal wording needs a reviewed
 * translation, and until one is entered the page shows the English text.
 */

export const DEFAULT_TERMS_PAGE: HomepageLegalPageContent = {
  enabled: false,
  title: "Terms & conditions",
  titleAr: "الشروط والأحكام",
  lastUpdated: "",
  lastUpdatedAr: "",
  intro: "These terms apply to every order placed on this website.",
  introAr: "",
  sections: [
    {
      title: "Who we are",
      body: "[Owner input required: the legal name of the business that sells on this website, its registration details and its address.]",
    },
    {
      title: "Where we deliver",
      body: "We deliver to addresses in Egypt only.",
    },
    {
      title: "Prices and payment",
      body: "Prices are shown and charged in Egyptian pounds (EGP). Cash on delivery is available on every order. Any other payment method is offered only when it is shown at checkout.",
    },
    {
      title: "Placing an order",
      body: "When you place an order, our system checks stock and calculates the item prices, any discount and any delivery fee again. If there is not enough stock for an item, the order is not placed and you are told which item is affected. Any delivery fee is shown at checkout before you confirm your order.",
    },
    {
      title: "Delivery times",
      body: "[Owner input required: how long delivery takes, and what happens if a delivery attempt fails.]",
    },
    {
      title: "Cancellations",
      body: "[Owner input required: whether, and until when, a customer can cancel an order, and how.]",
    },
    {
      title: "Returns and exchanges",
      body: "[Owner input required: a summary of the returns and exchange terms, or a pointer to the Returns & exchange page once it is published.]",
    },
    {
      title: "Your account",
      body: "You can place an order without creating an account. If you create one, you can see your orders and update your name, phone number and password from your account page.",
    },
    {
      title: "Governing law",
      body: "[Owner input required: the law that governs these terms and where disputes are handled.]",
    },
    {
      title: "Contact",
      body: "[Owner input required: the email address or other channel customers should use for questions about these terms.]",
    },
  ],
};

export const DEFAULT_PRIVACY_PAGE: HomepageLegalPageContent = {
  enabled: false,
  title: "Privacy policy",
  titleAr: "سياسة الخصوصية",
  lastUpdated: "",
  lastUpdatedAr: "",
  intro:
    "This policy describes the information this website collects when you use it, and what that information is used for.",
  introAr: "",
  sections: [
    {
      title: "Who is responsible for your information",
      body: "[Owner input required: the legal name and address of the business responsible for this information, and how to contact it about privacy.]",
    },
    {
      title: "When you place an order",
      body: "We collect your name, email address, phone number and delivery address (street address, city, governorate, and district or postal code where given). We use them to process and deliver your order and to contact you about it. You can place an order without creating an account.",
    },
    {
      title: "When you create an account",
      body: "We collect your name, email address and phone number. Your password is stored in hashed form, never as plain text. We keep a log of account events — account creation, sign-in attempts and password-reset requests — together with the email address involved.",
    },
    {
      title: "Your cart and the products you view",
      body: "Your cart is kept in your browser. A copy of your cart's contents and a list of the products you view are also saved on our server under a random identifier stored in your browser, so that we can send cart reminder emails. If you are signed in, they are linked to your account's email address.",
    },
    {
      title: "Emails",
      body: "We send emails about your orders and your account, such as order confirmations, email verification and password resets. If you give us your email address — for example by placing an order, creating an account, joining the mailing list or claiming a welcome offer — we may also send you marketing emails. Every marketing email contains an unsubscribe link, and once you unsubscribe we stop sending them.",
    },
    {
      title: "Mailing list and sign-up offers",
      body: "If you join the mailing list, we store your email address, and your phone number if you give it. If you claim a first-order discount from the sign-up pop-up, we store your email address, your phone number if you give it, the code issued to you, and the IP address and browser details of the claim, so that each offer is claimed only once.",
    },
    {
      title: "How the site is used",
      body: "The website records how it is used — for example pages and products viewed, items added to the cart, and checkouts started and completed. Each record is stored with a random identifier kept in your browser, the page address, the page you came from, any campaign tags in the link you followed, your browser details, and a shortened one-way hash of your IP address rather than the address itself.",
    },
    {
      title: "Cookies and browser storage",
      body: "The website uses a cookie that keeps you signed in and a cookie that remembers your language. Your browser's storage keeps your cart, your wishlist, any promo code you applied, your language, whether you have closed or used the sign-up pop-up, and the random identifiers described above. Analytics or advertising services, if switched on, may set cookies of their own.",
    },
    {
      title: "Analytics and advertising services",
      body: "[Owner input required: list any analytics or advertising services switched on in Dashboard > Pixels and what they receive, or state that none is used. None is switched on by default.]",
    },
    {
      title: "Service providers",
      body: "[Owner input required: list the outside companies that receive customer information — for example the email-sending provider, the hosting provider, and any courier or online-payment provider that is connected — and what each receives.]",
    },
    {
      title: "How long we keep information",
      body: "[Owner input required: how long each kind of information is kept.]",
    },
    {
      title: "Your choices",
      body: "You can unsubscribe from marketing emails at any time using the link in any marketing email. If you have an account, you can update your name, phone number and password from your account page. [Owner input required: how customers can ask for a copy of their information or for it to be deleted.]",
    },
  ],
};
