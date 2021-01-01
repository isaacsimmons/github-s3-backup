// TODO: swap this out to use environment-parser?
const requireEnv = (key) => {
    const value = process.env[key];
    if (!value) {
        console.error('Missing required environment value: ' + key);
        process.exit(1);
    }
    return value;
};

const GITHUB_USERNAME = requireEnv('GITHUB_USERNAME');
const GITHUB_ACCESS_TOKEN = requireEnv('GITHUB_ACCESS_TOKEN');
const AWS_BUCKET = requireEnv('AWS_BUCKET');
const AWS_ACCESS_KEY_ID = requireEnv('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = requireEnv('AWS_SECRET_ACCESS_KEY');

export const settings = {
    GITHUB_USERNAME,
    GITHUB_ACCESS_TOKEN,
    AWS_BUCKET,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
};
