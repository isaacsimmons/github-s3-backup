'use strict';

import { Octokit } from '@octokit/core';
import AWS from 'aws-sdk';
import { createHash } from 'crypto';
import { promises as fs, createReadStream } from 'fs';
import {promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { sep, join } from 'path';
import { tmpdir } from 'os';
import rimrafCallback from 'rimraf';
import { stringify } from 'querystring';

// Promisify a bunch of functions
const exec = promisify(execCallback);
const rimraf = (filepath) => new Promise((resolve, reject) => {
    rimrafCallback(filepath, {}, (error) => {
        if (error) {
            reject(error);
        } else {
            resolve();
        }
    });
});
const s3Upload = (bucketFilename, localFilename, hash) => 
    new Promise((resolve, reject) => {
        const params = {
          Bucket: AWS_BUCKET,
          Key: bucketFilename,
          Body: createReadStream(localFilename),
          ACL: 'private',
          ContentType: 'application/octet-stream',
          Metadata: { githash: hash },
        };

        s3.upload(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    });

const s3List = () => 
    new Promise((resolve, reject) => {
        s3.listObjectsV2({ Bucket: AWS_BUCKET }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    });


const s3Head = (key) => 
new Promise((resolve, reject) => {
    s3.headObject({Key: key, Bucket: AWS_BUCKET}, (err, data) => {
        if (err) {
            reject(err);
        } else {
            resolve(data);
        }
    });
});



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

const TMP_DIR = tmpdir() + sep;

const octokit = new Octokit({ auth: GITHUB_ACCESS_TOKEN });
const s3 = new AWS.S3({credentials: {accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY}});


const getS3Objects = async() => {
    const data = await s3List();
    return Promise.all(data.Contents.map(processS3Object));
};

const processRepository = async ({clone_url, full_name}) => {
    const hash = await getAllBranchesHash(full_name);

    const filename = `github_${full_name.replaceAll('/', '_')}.bundle`;

    const urlWithUsername = new URL(clone_url);
    urlWithUsername.username = GITHUB_USERNAME;

    return {
        clone_url: urlWithUsername.toString(),
        hash,
        filename,
        full_name,
    };
};

const processS3Object = async ({Key}) => {
    const data = await s3Head(Key);
    return {
        filename: Key,
        hash: data.Metadata.githash,
    };
};

const listRepos = async() => {
    const response = await octokit.request(`GET /search/repositories?q=user%3A${GITHUB_USERNAME}`);
    if (response.status !== 200) {
        throw new Error(`Error downloading repo list for ${source}`);
    }
    
    return await Promise.all(response.data.items.map(processRepository));
};

const getAllBranchesHash = async(full_name) => {
    const response = await octokit.request(`GET /repos/${full_name}/branches`);
    if (response.status !== 200) {
        throw new Error(`Error fetching branch information for ${full_name}`);
    }

    const branchHashes = response.data.map(respData => respData.commit.sha);
    if (branchHashes.length === 0) {
        throw new Error('No branch data found');
    }

    const shaSum = createHash('sha256');
    branchHashes.sort();
    for (const hash of branchHashes) {
        shaSum.update(hash);
    }
    return shaSum.digest('hex');
};

const main = async () => {
    // Grab all visible repositories from the current user
    const allRepos = await listRepos();

    // Grab all files currently in the S3 bucket and their hash metadata
    const currentFiles = new Map((await getS3Objects()).map(({filename, hash}) => [filename, hash]));

    // Filter down the repositories to only ones that need to be updated
    const staleRepos = allRepos.filter(({filename, hash}) => currentFiles.get(filename) !== hash);

    console.log(`Found ${allRepos.length} repositories of which ${staleRepos.length} need new backups`);

    for (const repo of staleRepos) {
        const tmpDir = await fs.mkdtemp(TMP_DIR);
        const repoDir = join(tmpDir, 'repo');
        const bundleFile = join(tmpDir, repo.filename);

        try {
            console.log(`Cloning ${repo.clone_url}...`);
            await exec(`git clone --mirror --bare ${repo.clone_url} repo`, {cwd: tmpDir, env: { GIT_ASKPASS: '/app/.git-askpass', GITHUB_ACCESS_TOKEN }});
            console.log(`Creating bundle ${repo.filename}...`);
            await exec(`git bundle create ${bundleFile} --all`, {cwd: repoDir});
            await rimraf(repoDir);

            // Upload the bundle file and the hash metadata
            console.log(`Uploading to s3://${AWS_BUCKET}/${repo.filename}...`)
            await s3Upload(repo.filename, bundleFile, repo.hash);
        } finally {
            await rimraf(tmpDir);
        }
    }
      
      console.log('Done');
};

main();


