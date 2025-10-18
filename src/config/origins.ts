const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://todo.onemainarmy.com",
  "https://auth.onemainarmy.com",
] as const;

type AllowedOrigin = (typeof DEFAULT_ALLOWED_ORIGINS)[number] | string;

const parseList = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const toOrigin = (url: string | undefined): string | null => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch (error) {
    console.warn(`Invalid URL provided when deriving origin: ${url}`);
    return null;
  }
};

export const resolveAllowedOrigins = (baseURL?: string): AllowedOrigin[] => {
  const origins = new Set<string>();
  const baseOrigin = toOrigin(baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  if (baseOrigin) {
    origins.add(baseOrigin);
  }

  for (const origin of DEFAULT_ALLOWED_ORIGINS) {
    origins.add(origin);
  }

  const envOrigins = parseList(process.env.BETTER_AUTH_TRUSTED_ORIGINS);
  for (const origin of envOrigins) {
    const parsed = toOrigin(origin) ?? origin;
    origins.add(parsed);
  }

  if (origins.has("")) {
    throw new Error("BETTER_AUTH_TRUSTED_ORIGINS cannot contain empty values");
  }

  return Array.from(origins);
};

export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) {
    return true;
  }

  const allowedOrigins = resolveAllowedOrigins();
  return allowedOrigins.includes(origin);
};

export { DEFAULT_ALLOWED_ORIGINS };
