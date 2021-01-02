import {createHash} from 'crypto';
import {promises as fs, createReadStream} from 'fs';
import {sep, join} from 'path';
import {tmpdir} from 'os';
import https from 'https';

import {Octokit} from '@octokit/core';

import {exec, rimraf, s3List, s3Upload, s3Head} from './promise-helpers.js';
import {settings} from './settings.js';

const TMP_DIR = tmpdir() + sep;

const octokit = new Octokit({auth: settings.GITHUB_ACCESS_TOKEN});

const listS3Objects = async () => {
  const data = await s3List({Bucket: settings.AWS_BUCKET});
  return Promise.all(data.Contents.map(async ({Key}) => {
    const data = await s3Head({Key, Bucket: settings.AWS_BUCKET});
    return {
      filename: Key,
      hash: data.Metadata.githash,
    };
  }));
};

const listGithubRepos = async () => {
  const response = await octokit.request(
      `GET /search/repositories?q=user%3A${settings.GITHUB_USERNAME}`,
  );
  if (response.status !== 200) {
    throw new Error(`Error downloading repo list for ${source}`);
  }

  return await Promise.all(response.data.items.map(
      async ({clone_url: url, full_name: name}) => {
        const hash = await getAllBranchesHash(name);

        const urlWithUsername = new URL(url);
        urlWithUsername.username = settings.GITHUB_USERNAME;

        return {
          cloneUrl: urlWithUsername.toString(),
          hash,
          filename: `github_${name.replaceAll('/', '_')}.bundle`,
        };
      },
  ));
};

const getAllBranchesHash = async (name) => {
  const response = await octokit.request(`GET /repos/${name}/branches`);
  if (response.status !== 200) {
    throw new Error(`Error fetching branch information for ${name}`);
  }

  const branchHashes = response.data.map((respData) => respData.commit.sha);
  if (branchHashes.length === 0) {
    throw new Error('No branch data found');
  }
  branchHashes.sort();

  const shaSum = createHash('sha256');
  for (const hash of branchHashes) {
    shaSum.update(hash);
  }
  return shaSum.digest('hex');
};

const main = async () => {
  // Grab all repositories from Github
  const allRepos = await listGithubRepos();
  console.log(`Found ${allRepos.length} repositories`);

  // Grab all files currently in the S3 bucket
  const currentFiles = new Map((await listS3Objects()).map(
      ({filename, hash}) => [filename, hash],
  ));

  // Filter down the repositories to only ones that need to be updated
  const staleRepos = allRepos.filter(
      ({filename, hash}) => currentFiles.get(filename) !== hash,
  );
  console.log(`${staleRepos.length} repositories need new backups`);

  for (const repo of staleRepos) {
    const tmpDir = await fs.mkdtemp(TMP_DIR);
    const repoDir = join(tmpDir, 'repo');
    const bundleFile = join(tmpDir, repo.filename);

    try {
      // Clone the repo
      console.log(`Cloning ${repo.cloneUrl}...`);
      await exec(`git clone --mirror --bare ${repo.cloneUrl} repo`, {
        cwd: tmpDir,
        env: {
          GIT_ASKPASS: '/app/.git-askpass',
          GITHUB_ACCESS_TOKEN: settings.GITHUB_ACCESS_TOKEN,
        },
      });

      // Create a git bundle
      console.log(`Creating bundle ${repo.filename}...`);
      await exec(`git bundle create ${bundleFile} --all`, {cwd: repoDir});
      await rimraf(repoDir);

      // Upload the bundle to S3
      console.log(`Uploading to s3://${settings.AWS_BUCKET}/${repo.filename}...`);
      await s3Upload({
        Bucket: settings.AWS_BUCKET,
        Key: repo.filename,
        Body: createReadStream(bundleFile),
        ACL: 'private',
        ContentType: 'application/octet-stream',
        Metadata: {githash: repo.hash},
      });
    } finally {
      await rimraf(tmpDir);
    }
  }

  if (settings.HEALTHCHECK_PING_URL) {
    https.get(settings.HEALTHCHECK_PING_URL).on('error', (err) => {
      throw new Error('Healthcheck Ping Failed: ' + err);
    });
  }
};

main();
