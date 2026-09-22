// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Contact form input behaviour and submit semantics.
 *
 * THE BUG: on the live contact page the email box blanked whatever the
 * customer typed, in Edge and in the ChatGPT in-app browser, so the form
 * could not even be submitted — it never reached the fail-closed SMTP path.
 *
 * The component's own state handling was never at fault, and these tests
 * prove it stays that way. What was missing was field IDENTITY: none of the
 * three inputs had an `id`, a `name`, a `<label>` or an `autocomplete`, and
 * the footer newsletter box on the same document was another anonymous
 * `type="email"` input. That is the input to Chromium's autofill field
 * classifier that makes it guess and group fields, and its preview/revert
 * cycle writes the DOM value directly without telling React — so a
 * controlled input goes blank mid-typing.
 *
 * jsdom implements no autofill, so the attribute assertions below are what
 * actually guard the fix; the typing tests guard the state handling that must
 * keep working alongside it.
 */

const submitMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("vike-react/useData", () => ({
  useData: () => ({ homepageContent: { contactBanner: null } }),
}));
vi.mock("vike-react/usePageContext", () => ({
  usePageContext: () => ({ urlPathname: "/contact" }),
}));
vi.mock("#root/frontend/contexts/LayoutSettingsContext", () => ({
  useLayoutSettings: () => ({ header: { navbarStyle: "minimal" } }),
  LayoutSettingsContext: { Provider: ({ children }: never) => children },
}));
let mockLocale: "en" | "ar" = "en";
vi.mock("#root/lib/i18n/MinimalI18nContext", () => ({
  useMinimalI18n: () => ({
    t: (k: string) => k,
    locale: mockLocale,
    dir: mockLocale === "ar" ? "rtl" : "ltr",
  }),
}));
vi.mock("#root/shared/trpc/client", () => ({
  trpc: { contact: { submit: { mutate: (...a: unknown[]) => submitMock(...a) } } },
}));
vi.mock("sonner", () => ({
  toast: { success: (...a: unknown[]) => toastSuccess(...a), error: (...a: unknown[]) => toastError(...a) },
}));

const { Page } = await import("../+Page");

const EMAIL = "nour.hassan@example.com";

const fields = () => ({
  name: screen.getByPlaceholderText("Name") as HTMLInputElement,
  email: screen.getByPlaceholderText("Email") as HTMLInputElement,
  message: screen.getByPlaceholderText("Message") as HTMLTextAreaElement,
  submit: screen.getByRole("button", { name: /submit/i }),
});

beforeEach(() => {
  mockLocale = "en";
  submitMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
  submitMock.mockResolvedValue({ success: true });
});

// ─── Typing and retention ───────────────────────────────────────────────────

describe("email input retains what is typed", () => {
  it("keeps the whole address when typed character by character", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const { email } = fields();

    // Assert after EVERY keystroke: a field that blanks mid-entry fails on
    // the character it blanked, not silently at the end.
    let expected = "";
    for (const char of EMAIL) {
      await user.type(email, char);
      expected += char;
      expect(email.value).toBe(expected);
    }

    expect(email.value).toBe(EMAIL);
  });

  it("keeps the address after the field loses and regains focus", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const { email, name } = fields();

    await user.type(email, EMAIL);
    await user.click(name);
    await user.click(email);

    expect(email.value).toBe(EMAIL);
  });

  it("preserves the email while the other fields are filled in", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const { name, email, message } = fields();

    await user.type(email, EMAIL);
    await user.type(name, "Nour Hassan");
    await user.type(message, "Do you carry titanium threadless?");

    expect(email.value).toBe(EMAIL);
    expect(name.value).toBe("Nour Hassan");
  });

  it("preserves the email when an earlier field is edited afterwards", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const { name, email } = fields();

    await user.type(email, EMAIL);
    await user.type(name, "Nour");
    await user.clear(name);
    await user.type(name, "Nour Hassan");

    expect(email.value).toBe(EMAIL);
  });

  it("supports addresses with dots, plus tags and subdomains", async () => {
    const user = userEvent.setup();
    render(<Page />);
    const { email } = fields();
    const tagged = "nour.h+piercing@mail.example.co.uk";

    await user.type(email, tagged);
    expect(email.value).toBe(tagged);
  });
});

// ─── The fix itself: field identity ─────────────────────────────────────────

describe("fields are identified for the browser", () => {
  it("gives the email box an id, name, label and autocomplete", () => {
    render(<Page />);
    const { email } = fields();

    expect(email.id).toBe("contact-email");
    expect(email.getAttribute("name")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    // A label the classifier (and a screen reader) can read.
    expect(
      document.querySelector('label[for="contact-email"]'),
    ).not.toBeNull();
  });

  it("identifies the other two fields as well, so none is left anonymous", () => {
    render(<Page />);
    const { name, message } = fields();

    expect(name.id).toBe("contact-name");
    expect(name.getAttribute("name")).toBe("name");
    expect(name.getAttribute("autocomplete")).toBe("name");

    expect(message.id).toBe("contact-message");
    expect(message.getAttribute("name")).toBe("message");
  });

  it("leaves no unnamed email input in the document", () => {
    render(<Page />);
    for (const input of document.querySelectorAll('input[type="email"]')) {
      expect(input.getAttribute("name")).toBeTruthy();
      expect(input.getAttribute("autocomplete")).toBeTruthy();
    }
  });

  it("renders the address left-to-right even when the page is RTL", () => {
    // An email address is LTR text even in Arabic; bidi reordering of "@"
    // and "." inside an RTL box garbles it as the customer types. The name
    // and message fields DO follow the locale — only the address is pinned.
    mockLocale = "ar";
    render(<Page />);

    const email = document.querySelector("#contact-email") as HTMLInputElement;
    const name = document.querySelector("#contact-name") as HTMLInputElement;
    expect(email.getAttribute("dir")).toBe("ltr");
    expect(name.getAttribute("dir")).toBe("rtl");
  });

  it("still retains a typed address in the RTL layout", async () => {
    mockLocale = "ar";
    const user = userEvent.setup();
    render(<Page />);
    const email = document.querySelector("#contact-email") as HTMLInputElement;

    await user.type(email, EMAIL);
    expect(email.value).toBe(EMAIL);
  });
});

// ─── Submit semantics ───────────────────────────────────────────────────────

const fillIn = async (user: ReturnType<typeof userEvent.setup>) => {
  const { name, email, message } = fields();
  await user.type(name, "Nour Hassan");
  await user.type(email, EMAIL);
  await user.type(message, "Do you carry titanium threadless?");
};

describe("submission with the email service unavailable", () => {
  beforeEach(() => {
    // What the server returns with no SMTP configured, or no destination.
    submitMock.mockResolvedValue({
      success: false,
      error: "Failed to send message. Please try again later.",
    });
  });

  it("shows the failure to the customer", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0]?.[0]).toMatch(/failed to send/i);
  });

  it("never reports success", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("keeps everything the customer typed so they can retry", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const { name, email, message } = fields();
    expect(email.value).toBe(EMAIL);
    expect(name.value).toBe("Nour Hassan");
    expect(message.value).toBe("Do you carry titanium threadless?");
  });

  it("keeps the data when the request throws outright", async () => {
    submitMock.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(fields().email.value).toBe(EMAIL);
  });

  it("re-enables the button so a retry is possible", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect((fields().submit as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("successful submission", () => {
  it("sends the trimmed values the customer entered", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(submitMock).toHaveBeenCalled());
    expect(submitMock).toHaveBeenCalledWith({
      name: "Nour Hassan",
      email: EMAIL,
      message: "Do you carry titanium threadless?",
    });
  });

  it("reports success and clears the form — the one intended reset", async () => {
    const user = userEvent.setup();
    render(<Page />);
    await fillIn(user);
    await user.click(fields().submit);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();

    const { name, email, message } = fields();
    expect(email.value).toBe("");
    expect(name.value).toBe("");
    expect(message.value).toBe("");
  });
});
