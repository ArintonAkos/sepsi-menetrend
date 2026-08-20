/** The dismiss hook, and the shape of its dependency list. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, useState } from "react";
import { useDismiss } from "./useDismiss";

afterEach(cleanup);

function Panel({ extra }: { extra: boolean }) {
  const [open, setOpen] = useState(true);
  const anchor = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  // the number of refs depends on a prop, which is the whole point
  useDismiss(open, () => setOpen(false), ...(extra ? [anchor, sheet] : [anchor]));
  return (
    <div>
      <div ref={anchor} data-testid="anchor">anchor</div>
      {open && <div ref={sheet} data-testid="sheet">sheet</div>}
    </div>
  );
}

/** A sheet with something tappable behind it, the way the settings sheet sits
 *  over the results list. */
function OverSomething() {
  const [open, setOpen] = useState(true);
  const [behind, setBehind] = useState(0);
  const sheet = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), sheet);
  return (
    <div>
      <button onClick={() => setBehind((n) => n + 1)}>underneath {behind}</button>
      {open && <div ref={sheet} data-testid="sheet">sheet</div>}
    </div>
  );
}

describe("useDismiss", () => {
  it("survives a caller that passes a different number of refs", () => {
    /* The refs used to be spread into the dependency array, so the array's
       length became part of the call site. React throws "the final argument
       passed to useEffect changed size between renders" the moment a panel
       gains a second element that counts as inside - which is exactly what
       happened when the settings sheet moved into a portal. */
    const complain = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, getByTestId } = render(<Panel extra={false} />);
    rerender(<Panel extra />);
    rerender(<Panel extra={false} />);
    expect(complain.mock.calls.map((c) => String(c[0])).join("\n"))
      .not.toMatch(/changed size between renders/);
    complain.mockRestore();
    expect(getByTestId("sheet")).toBeInTheDocument();
  });

  it("still closes on a press outside and stays open on one inside", () => {
    const { getByTestId, queryByTestId } = render(<Panel extra />);
    fireEvent.click(getByTestId("sheet"));
    expect(queryByTestId("sheet")).toBeInTheDocument();
    fireEvent.click(document.body);
    expect(queryByTestId("sheet")).not.toBeInTheDocument();
  });

  it("spends the dismissing press on the dismissal, not on what is behind it", () => {
    /* Closing happens on pointerdown, and the browser still delivers the click
       afterwards. Tapping beside the settings sheet therefore shut the sheet
       and pressed whatever was underneath it in the same gesture. */
    const { getByText, queryByTestId } = render(<OverSomething />);
    const behind = getByText(/underneath/);
    fireEvent.click(behind);
    expect(queryByTestId("sheet")).not.toBeInTheDocument();
    expect(behind.textContent, "the press leaked through to the control below")
      .toBe("underneath 0");
  });

  it("leaves later presses alone, with no timer left armed behind it", () => {
    const { getByText, queryByTestId } = render(<OverSomething />);
    const behind = getByText(/underneath/);
    fireEvent.click(behind);
    expect(queryByTestId("sheet")).not.toBeInTheDocument();
    // the sheet is gone; from here the button is just a button
    fireEvent.click(behind);
    expect(behind.textContent).toBe("underneath 1");
  });
});
