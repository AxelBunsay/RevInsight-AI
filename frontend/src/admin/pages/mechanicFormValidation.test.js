import { describe, expect, it } from "vitest";
import {
  getMechanicFormError,
  isValidMechanicUsername,
  isValidPhilippinePhone,
} from "./mechanicFormValidation";

const validForm = {
  firstName: "Morgan",
  lastName: "Mechanic",
  username: "morgan.mechanic",
  phoneNumber: "09171234567",
  specialization: "general",
  yearsOfExperience: "5",
  password: "MechanicPass1",
};

describe("mechanic form validation", () => {
  it("accepts normalized username rules and Philippine mobile formats", () => {
    expect(isValidMechanicUsername(" Morgan.Mechanic ")).toBe(true);
    expect(isValidMechanicUsername("_bad")).toBe(false);
    expect(isValidMechanicUsername("abc")).toBe(false);
    expect(isValidPhilippinePhone("+63 917 123 4567")).toBe(true);
    expect(isValidPhilippinePhone("09171234567")).toBe(true);
    expect(isValidPhilippinePhone("not a phone")).toBe(false);
  });

  it("validates create credentials and permits an empty optional email", () => {
    expect(getMechanicFormError({ ...validForm, email: "" }, false)).toBe("");
    expect(getMechanicFormError({ ...validForm, username: "x" }, false)).toMatch(/Username/);
    expect(getMechanicFormError({ ...validForm, phoneNumber: "" }, false)).toMatch(/mobile number/);
    expect(getMechanicFormError({ ...validForm, password: "weak" }, false)).toMatch(/Password/);
  });

  it("allows an unchanged password on edit but validates a provided reset password", () => {
    expect(getMechanicFormError({ ...validForm, password: "" }, true)).toBe("");
    expect(getMechanicFormError({ ...validForm, password: "weak" }, true)).toMatch(/Password/);
  });
});
