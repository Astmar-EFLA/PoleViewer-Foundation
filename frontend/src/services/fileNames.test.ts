import { describe, expect, it } from "vitest";
import { fileSafeName } from "./fileNames";

describe("fileSafeName", () => {
  it("keeps an ordinary mast name exactly as-is", () => {
    expect(fileSafeName("M-12", "fallback")).toBe("M-12");
    expect(fileSafeName("Þverá 3", "fallback")).toBe("Þverá 3");
  });

  it("replaces characters Windows forbids in filenames", () => {
    expect(fileSafeName('A/B\\C:D*E?F"G<H>I|J', "fallback")).toBe("A_B_C_D_E_F_G_H_I_J");
  });

  it("trims surrounding whitespace and trailing dots", () => {
    expect(fileSafeName("  M12. ", "fallback")).toBe("M12");
  });

  it("falls back when nothing usable is left", () => {
    expect(fileSafeName("  ", "mast-3")).toBe("mast-3");
    expect(fileSafeName("...", "mast-3")).toBe("mast-3");
  });
});
