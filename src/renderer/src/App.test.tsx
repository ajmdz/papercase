import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the empty library foundation", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Reading desk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No books yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0 books")).toBeInTheDocument();
  });
});
