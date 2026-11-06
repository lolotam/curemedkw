import { describe, expect, it } from "vitest";
import { splitTextLinks, toLinkHref } from "./linkify";

const links = (text: string) => splitTextLinks(text).filter(segment => segment.kind === "link").map(segment => segment.value);

describe("splitTextLinks", () => {
  it("reproduces the input exactly when the segments are joined", () => {
    const text = "Track it at https://curemedkw.com/orders/12?x=1#top، thanks (see www.example.com).";
    expect(splitTextLinks(text).map(segment => segment.value).join("")).toBe(text);
  });

  it("leaves Arabic and Latin sentence punctuation outside the link", () => {
    expect(links("رابط الطلب https://curemedkw.com/orders،")).toEqual(["https://curemedkw.com/orders"]);
    expect(links("هل وصلك؟ https://curemedkw.com/a؟")).toEqual(["https://curemedkw.com/a"]);
    expect(links("Open https://x.test/page.")).toEqual(["https://x.test/page"]);
  });

  it("keeps a balanced closing parenthesis and drops an unbalanced one", () => {
    expect(links("https://en.wikipedia.org/wiki/Kuwait_(city)")).toEqual(["https://en.wikipedia.org/wiki/Kuwait_(city)"]);
    expect(links("(see https://x.test/a)")).toEqual(["https://x.test/a"]);
  });

  it("finds every link in a message, including consecutive calls on the same text", () => {
    const text = "https://a.test and www.b.test";
    expect(links(text)).toEqual(["https://a.test", "www.b.test"]);
    expect(links(text)).toEqual(["https://a.test", "www.b.test"]);
  });

  it("returns plain text untouched when there is no link", () => {
    expect(splitTextLinks("no links here")).toEqual([{ kind: "text", value: "no links here" }]);
  });
});

describe("toLinkHref", () => {
  it("adds https to www links and keeps explicit protocols", () => {
    expect(toLinkHref("www.b.test")).toBe("https://www.b.test");
    expect(toLinkHref("http://a.test")).toBe("http://a.test");
  });
});
