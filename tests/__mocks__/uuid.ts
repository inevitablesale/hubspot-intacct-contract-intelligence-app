// Mock uuid for Jest
let counter = 0;

export const v4 = () => {
  counter++;
  return `mock-uuid-${counter}-${Date.now().toString(36)}`;
};

export const v1 = () => v4();
export const v3 = () => v4();
export const v5 = () => v4();
export const NIL = '00000000-0000-0000-0000-000000000000';
export const MAX = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
export const parse = () => new Uint8Array(16);
export const stringify = () => v4();
export const validate = () => true;
export const version = () => 4;

export default { v4, v1, v3, v5, NIL, MAX, parse, stringify, validate, version };
