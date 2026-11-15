import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeNotificationRecipients,
  maskEmail,
  parseNotificationEmails,
  resolveNotificationRecipientSource,
} from "../notification-recipients";
import { listNotificationRecipients, logOrderNotificationRecipients } from "../service";

/**
 * ORDER_NOTIFICATION_EMAILS parsing. Values arrive from a Coolify text field,
 * so they come with leading "=", quotes, brackets, `mailto:` and every kind of
 * separator. Whatever is still not a plain address afterwards must never be
 * enqueued.
 */

const emails = (raw: string | undefined | null) => parseNotificationEmails(raw).emails;

/** Every message a console spy received, as strings. */
const messages = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => String(call[0]));

describe("parseNotificationEmails — separators, case and duplicates", () => {
  it.each([
    ["comma", "a@x.com,b@y.com"],
    ["semicolon", "a@x.com;b@y.com"],
    ["space", "a@x.com b@y.com"],
    ["tab", "a@x.com\tb@y.com"],
    ["newline", "a@x.com\nb@y.com"],
    ["CRLF", "a@x.com\r\nb@y.com"],
    ["mixed, with padding and empties", "  a@x.com ,; \n\t b@y.com ,, "],
  ])("splits on %s", (_, raw) => {
    expect(parseNotificationEmails(raw)).toEqual({ emails: ["a@x.com", "b@y.com"], invalidCount: 0, hasEntries: true });
  });

  it("lower-cases and de-duplicates case-insensitively, keeping first-seen order", () => {
    expect(emails("Owner@Gmail.com; ops@perce-eg.com, OWNER@gmail.COM")).toEqual(["owner@gmail.com", "ops@perce-eg.com"]);
  });
});

describe("parseNotificationEmails — wrappers", () => {
  it.each([
    ["one leading '=' (Coolify)", "=muhammeddamiinn@gmail.com"],
    ["several leading '='", "===muhammeddamiinn@gmail.com"],
    ["'=' then a space", "= muhammeddamiinn@gmail.com"],
    ["single quotes", "'muhammeddamiinn@gmail.com'"],
    ["double quotes", '"muhammeddamiinn@gmail.com"'],
    ["angle brackets", "<muhammeddamiinn@gmail.com>"],
    ["mailto:", "mailto:muhammeddamiinn@gmail.com"],
    ["MAILTO: upper-case", "MAILTO:muhammeddamiinn@gmail.com"],
    ["everything nested", `='"<mailto:MuhammedDamiinn@Gmail.com>"'`],
    ["'=' inside quotes", "'=muhammeddamiinn@gmail.com'"],
  ])("strips %s", (_, raw) => {
    expect(parseNotificationEmails(raw)).toEqual({
      emails: ["muhammeddamiinn@gmail.com"],
      invalidCount: 0,
      hasEntries: true,
    });
  });

  it("unwraps a whole quoted list, and a list of individually quoted entries", () => {
    expect(emails(`"a@x.com, b@y.com"`)).toEqual(["a@x.com", "b@y.com"]);
    expect(emails(`'a@x.com';'b@y.com'`)).toEqual(["a@x.com", "b@y.com"]);
    expect(emails(`="<a@x.com>" <b@y.com>`)).toEqual(["a@x.com", "b@y.com"]);
  });

  it("keeps the address from a display-name form and counts the name as invalid", () => {
    expect(parseNotificationEmails("Owner <owner@gmail.com>")).toEqual({
      emails: ["owner@gmail.com"],
      invalidCount: 1,
      hasEntries: true,
    });
  });
});

describe("parseNotificationEmails — anything not a plain address is invalid, never kept", () => {
  it.each([
    "not-an-email",
    "a@b",
    "owner@gmail",
    "owner@gmail.com.",
    "owner@@gmail.com",
    "@gmail.com",
    "owner@",
    ".owner@gmail.com",
    "own..er@gmail.com",
    "owner.@gmail.com",
    "owner@-gmail.com",
    "owner@gmail-.com",
    "owner@gmail.c",
    "owner@gmail.123",
    "'owner@gmail.com", // unbalanced quote
    "owner@gmail.com'",
    "<owner@gmail.com", // unbalanced bracket
    '"owner"@gmail.com', // quoted local part
    "o'brien@gmail.com", // deliberately conservative
    "owner@gmail.com:25",
    "mailto:owner", // a scheme with no address behind it
  ])("rejects %j", (raw) => {
    const parsed = parseNotificationEmails(raw);
    expect(parsed.emails).toEqual([]);
    expect(parsed.invalidCount).toBe(1);
    expect(parsed.hasEntries).toBe(true);
  });

  it("keeps the valid entries and counts the rest", () => {
    expect(parseNotificationEmails("not-an-email, a@b, owner@gmail.com 'x")).toEqual({
      emails: ["owner@gmail.com"],
      invalidCount: 3,
      hasEntries: true,
    });
  });

  it.each([undefined, null, "", "   ", " , ; \n\t ", "=", "==", "''", '""', "<>", "mailto:"])(
    "has no entries for %j",
    (raw) => {
      expect(parseNotificationEmails(raw)).toEqual({ emails: [], invalidCount: 0, hasEntries: false });
    },
  );
});

describe("resolveNotificationRecipientSource", () => {
  it("uses the env list when it has a valid address", () => {
    expect(resolveNotificationRecipientSource("muhammeddamiinn@gmail.com, oops")).toEqual({
      source: "env",
      emails: ["muhammeddamiinn@gmail.com"],
      invalidCount: 1,
    });
  });

  it("falls back to admin users when unset or empty", () => {
    expect(resolveNotificationRecipientSource(undefined)).toEqual({ source: "admin_users", reason: "unset", invalidCount: 0 });
    expect(resolveNotificationRecipientSource(" = ")).toEqual({ source: "admin_users", reason: "unset", invalidCount: 0 });
  });

  it("falls back to admin users, flagged, when set but nothing is valid", () => {
    expect(resolveNotificationRecipientSource("oops; muhammeddamiinn@gmail")).toEqual({
      source: "admin_users",
      reason: "no_valid_address",
      invalidCount: 2,
    });
  });
});

describe("maskEmail", () => {
  it.each([
    ["muhammeddamiinn@gmail.com", "mu***@gmail.com"],
    ["owner@perce-eg.com", "ow***@perce-eg.com"],
    ["abc@x.com", "a***@x.com"],
    ["ab@x.com", "a***@x.com"],
    ["a@x.com", "a***@x.com"],
  ])("%s → %s", (email, masked) => {
    expect(maskEmail(email)).toBe(masked);
  });
});

describe("describeNotificationRecipients (the start-up line)", () => {
  it("env list: info, masked, never the full address", () => {
    const line = describeNotificationRecipients("muhammeddamiinn@gmail.com");
    expect(line.level).toBe("info");
    expect(line.message).toBe("[OrderEmails] New-order notifications → ORDER_NOTIFICATION_EMAILS: mu***@gmail.com");
    expect(line.message).not.toContain("muhammeddamiinn");
  });

  it("env list with some invalid entries: warn, counted only", () => {
    const line = describeNotificationRecipients("muhammeddamiinn@gmail.com, secret-typo, other@bad");
    expect(line.level).toBe("warn");
    expect(line.message).toBe(
      "[OrderEmails] New-order notifications → ORDER_NOTIFICATION_EMAILS: mu***@gmail.com (2 invalid entries ignored)",
    );
    expect(line.message).not.toContain("secret-typo");
    expect(line.message).not.toContain("other@bad");
  });

  it("unset: info, says 'not set'", () => {
    expect(describeNotificationRecipients(undefined)).toEqual({
      level: "info",
      message: "[OrderEmails] New-order notifications → every admin user (ORDER_NOTIFICATION_EMAILS not set)",
    });
  });

  it("set but no valid address: warn, distinct from 'not set', counted only", () => {
    const line = describeNotificationRecipients("muhammeddamiinn gmail.com");
    expect(line).toEqual({
      level: "warn",
      message:
        "[OrderEmails] New-order notifications → every admin user (ORDER_NOTIFICATION_EMAILS is set but has no valid address; 2 invalid entries ignored)",
    });
    expect(line.message).not.toContain("not set");
    expect(line.message).not.toContain("muhammeddamiinn");
  });
});

describe("logOrderNotificationRecipients", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reads ORDER_NOTIFICATION_EMAILS and logs at info when valid", () => {
    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", "=muhammeddamiinn@gmail.com");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logOrderNotificationRecipients();
    expect(info).toHaveBeenCalledWith("[OrderEmails] New-order notifications → ORDER_NOTIFICATION_EMAILS: mu***@gmail.com");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs at warn when set but invalid", () => {
    vi.stubEnv("ORDER_NOTIFICATION_EMAILS", "oops");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    logOrderNotificationRecipients();
    expect(messages(warn)).toEqual([expect.stringContaining("is set but has no valid address; 1 invalid entry ignored")]);
    expect(info).not.toHaveBeenCalled();
  });
});

describe("listNotificationRecipients (lookup injected)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("env list → only those addresses; the admin-user lookup is never called", async () => {
    const admins = vi.fn(async () => ["mhmd@amin.com"]);
    await expect(listNotificationRecipients("'MuhammedDamiinn@Gmail.com'", admins)).resolves.toEqual([
      "muhammeddamiinn@gmail.com",
    ]);
    expect(admins).not.toHaveBeenCalled();
  });

  it("unset → every admin user, without a warning (the previous behaviour)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admins = vi.fn(async () => ["admin@example.com"]);
    await expect(listNotificationRecipients(undefined, admins)).resolves.toEqual(["admin@example.com"]);
    expect(admins).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("set but invalid → warns with a count only, then every admin user", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admins = vi.fn(async () => ["admin@example.com"]);
    await expect(listNotificationRecipients("secret-typo", admins)).resolves.toEqual(["admin@example.com"]);
    expect(messages(warn)).toEqual([expect.stringContaining("1 invalid entry")]);
    expect(messages(warn).join("\n")).not.toContain("secret-typo");
  });

  it("partly invalid → the valid addresses, with a count-only warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const admins = vi.fn(async () => ["mhmd@amin.com"]);
    await expect(listNotificationRecipients("muhammeddamiinn@gmail.com secret-typo", admins)).resolves.toEqual([
      "muhammeddamiinn@gmail.com",
    ]);
    expect(admins).not.toHaveBeenCalled();
    expect(messages(warn)).toEqual([expect.stringContaining("1 invalid entry ignored")]);
    expect(messages(warn).join("\n")).not.toContain("secret-typo");
  });
});
