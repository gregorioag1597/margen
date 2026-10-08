export const BUSINESS_TYPES = [
  { value: 'gastronomia', label: 'Gastronomía' },
  { value: 'fabricacion', label: 'Fabricación' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'comercio', label: 'Comercio' },
  { value: 'otro', label: 'Otro' },
] as const;

export type BusinessType = (typeof BUSINESS_TYPES)[number]['value'];

export const CURRENCIES = [
  { value: 'ARS', label: 'Peso argentino (ARS)' },
  { value: 'USD', label: 'Dólar (USD)' },
  { value: 'UYU', label: 'Peso uruguayo (UYU)' },
  { value: 'CLP', label: 'Peso chileno (CLP)' },
  { value: 'MXN', label: 'Peso mexicano (MXN)' },
  { value: 'COP', label: 'Peso colombiano (COP)' },
  { value: 'PEN', label: 'Sol (PEN)' },
  { value: 'EUR', label: 'Euro (EUR)' },
] as const;
