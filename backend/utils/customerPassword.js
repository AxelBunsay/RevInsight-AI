function validCustomerPassword(value) {
  return typeof value === 'string' && value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}
module.exports = { validCustomerPassword };
