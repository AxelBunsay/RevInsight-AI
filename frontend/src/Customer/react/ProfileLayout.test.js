import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const sharedStyles = readSource('../styles/shared.css');
const accountStyles = readSource('../styles/customer-flow.css');
const profilePage = readSource('./Profile.jsx');
const customerLayout = readSource('./CustomerLayout.jsx');

describe('customer account responsive layout', () => {
  it('uses the shared wide-content padding for Account without widening other customer pages', () => {
    expect(sharedStyles).toContain('.customer-page {\n  --customer-wide-content-padding: clamp(16px, 3vw, 44px);');
    expect(accountStyles).toContain('.customer-page.profile-page .customer-header {\n  width: 100%;\n  max-width: none;');
    expect(accountStyles).toContain('.customer-page.profile-page .customer-flow-page.customer-account-page {\n  width: 100%;\n  max-width: none;');
  });

  it('keeps the summary column bounded and account content flexible', () => {
    expect(accountStyles).toContain('grid-template-columns: minmax(280px, 300px) minmax(0, 1fr)');
    expect(accountStyles).toContain('.customer-page.profile-page .customer-account-panel {\n  width: 100%;\n  min-width: 0;');
  });

  it('uses responsive form and list grids with mobile breakpoints', () => {
    expect(accountStyles).toContain('grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))');
    expect(accountStyles).toContain('grid-template-columns: repeat(auto-fill, minmax(min(100%, 360px), 1fr))');
    expect(accountStyles).toContain('@media (max-width: 900px)');
    expect(accountStyles).toContain('@media (max-width: 480px)');
    expect(accountStyles).toContain('padding-right: 16px;\n    padding-left: 16px;');
    expect(accountStyles).toContain('grid-template-columns: minmax(0, 1fr);');
  });

  it('keeps profile and security inputs aligned and sizes their buttons consistently', () => {
    expect(accountStyles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));\n  align-items: start;');
    expect(accountStyles).toContain('grid-template-rows: auto 44px minmax(18px, auto);');
    expect(accountStyles).toContain('.customer-account-email-field {\n  grid-template-rows: auto 44px;');
    expect(profilePage).toContain(`className="customer-account-email-field">Email address<input type="email" readOnly title="Your email is your login and can't be changed here."`);
    expect(profilePage).not.toContain('Contact the shop to change your email.');
    expect(accountStyles).toContain('height: 44px;\n  min-height: 44px;');
    expect(accountStyles).toContain('height: 40px;\n  padding: 0 20px;');
    expect(accountStyles).toContain('@media (min-width: 481px) and (max-width: 1199px)');
    expect(accountStyles).toContain('@media (max-width: 480px)');
    expect(profilePage).toContain('className="customer-password-toggle"');
  });

  it('renders username as a read-only profile field', () => {
    expect(profilePage).toContain('Username<input type="text" readOnly title="Your username can\'t be changed here."');
  });

  it('uses the navbar brand tagline and omits the duplicate eyebrow only on Account', () => {
    expect(customerLayout).toContain('<strong>MANOY&apos;S</strong><small>MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</small>');
    expect(customerLayout).toContain("{title !== 'Account' && <p className=\"customer-eyebrow\">MOTORCYCLE PARTS, ACCESSORIES &amp; SERVICES</p>}");
    expect(accountStyles).toContain('font: 800 24px/1 \'Segoe UI\', sans-serif;');
    expect(accountStyles).toContain('font: 700 11px/1.2 \'Segoe UI\', sans-serif;');
    expect(accountStyles).toContain('@media (max-width: 640px)');
    expect(accountStyles).toContain('@media (max-width: 480px)');
  });
});
