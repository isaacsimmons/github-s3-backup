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
const GITHUB_KEY = requireEnv('GITHUB_KEY'); // or whatever
const AWS_BUCKET = requireEnv('AWS_BUCKET');
const AWS_ACCESS_KEY_ID = requireEnv('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = requireEnv('AWS_SECRET_ACCESS_KEY');

// List all repos from Github (belonging to the user specified by GH_USERNAME?) (what if I also want to backup some of my org repos?)

// Get the latest action from each repo's stream

// List all files already in the bucket

// Get the "lastAction" metadata key from each

// Calculate the list of repos to backup

// git clone --mirror
// git bundle --all
// Maybe just use the archive/zip option? (or, you know, not)
// upload new version

console.log('Done');