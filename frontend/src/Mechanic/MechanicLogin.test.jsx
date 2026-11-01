import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import MechanicLogin from "./MechanicLogin";
import {
  getMechanicLoginDestination,
  getPasswordInputType,
  togglePasswordVisibility,
} from "./mechanicLoginHelpers";

describe("mechanic login form", () => {
  it("renders a username login with the requested autocomplete and password visibility control", () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(MechanicLogin)),
    );

    expect(markup).toContain('src="/logo-mechanic.png"');
    expect(markup).toContain("MECHANIC PORTAL");
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('autoCapitalize="none"');
    expect(markup).toContain('spellCheck="false"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-label="Show password"');
    expect(markup).toContain('class="mechanic-login-remember"');
    expect(markup).toContain('type="checkbox" checked=""');
  });

  it("toggles the password input between masked and visible", () => {
    const visible = togglePasswordVisibility(false);
    expect(visible).toBe(true);
    expect(getPasswordInputType(visible)).toBe("text");
    const hidden = togglePasswordVisibility(visible);
    expect(hidden).toBe(false);
    expect(getPasswordInputType(hidden)).toBe("password");
  });

  it("keeps post-login navigation inside the mechanic portal", () => {
    expect(getMechanicLoginDestination('/mechanic/jobs', '/admin'))
      .toBe('/mechanic/jobs');
    expect(getMechanicLoginDestination('/customer/services', '/admin'))
      .toBe('/mechanic/dashboard');
    expect(getMechanicLoginDestination(null, '/mechanic/profile'))
      .toBe('/mechanic/profile');
    expect(getMechanicLoginDestination(null, '//example.com'))
      .toBe('/mechanic/dashboard');
  });
});
