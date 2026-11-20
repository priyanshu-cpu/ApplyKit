const env = import.meta.env;
const publisher = env.PUBLIC_ADS_PUBLISHER || "";
const slot = (value: string | undefined) =>
  /^\d+$/.test(value || "") ? value : undefined;
export const ads = {
  enabled:
    env.PUBLIC_ADS_ENABLED === "true" && /^ca-pub-\d{16}$/.test(publisher),
  publisher,
  slots: {
    home: slot(env.PUBLIC_ADS_HOME),
    categories: slot(env.PUBLIC_ADS_CATEGORIES),
    tool: slot(env.PUBLIC_ADS_TOOL),
    article: slot(env.PUBLIC_ADS_ARTICLE),
    sidebar: slot(env.PUBLIC_ADS_SIDEBAR),
  },
};
const measurement = env.PUBLIC_GA_MEASUREMENT_ID || "";
export const analytics = {
  enabled:
    env.PUBLIC_ANALYTICS_ENABLED === "true" &&
    /^G-[A-Z0-9]+$/.test(measurement),
  measurement,
};
