import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Money } from "./Money";

const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("<Money />", () => {
  it('renders micros="10000" as $0.01', () => {
    const html = renderToStaticMarkup(<Money micros="10000" />);
    // Screen-reader text carries the full amount; the visual parts split dollars and cents.
    expect(html).toContain('<span class="sr-only">$0.01</span>');
    expect(text(html)).toContain("$0.01");
  });

  it("renders mono amounts as one tabular string", () => {
    const html = renderToStaticMarkup(<Money micros="1234560000" variant="mono" />);
    expect(text(html)).toBe("$1,234.56");
    expect(html).toContain("tabular");
  });

  it("shows sub-cent amounts and signs", () => {
    expect(text(renderToStaticMarkup(<Money micros="500" variant="text" />))).toBe("$0.0005");
    expect(text(renderToStaticMarkup(<Money micros="10000" variant="mono" signed />))).toBe("+$0.01");
    expect(text(renderToStaticMarkup(<Money micros="-10000" variant="mono" />))).toBe("-$0.01");
  });

  it("renders the rolling variant with the full value for screen readers", () => {
    const html = renderToStaticMarkup(<Money micros="50000000" rolling />);
    expect(html).toContain('<span class="sr-only">$50.00</span>');
  });
});
