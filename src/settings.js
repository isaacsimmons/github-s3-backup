import { Settings, envType } from 'environment-parser';

export const settings = Settings({
  GITHUB_USERNAME: envType.string(),
  GITHUB_ACCESS_TOKEN: envType.string(),

  AWS_REGION: envType.string(),
  AWS_BUCKET: envType.string(),
  AWS_ACCESS_KEY_ID: envType.string(),
  AWS_SECRET_ACCESS_KEY: envType.string(),

  HEALTHCHECK_PING_URL: envType.string({optional: true}),
});
