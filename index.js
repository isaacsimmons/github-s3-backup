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

const TMP_DIR = tmpdir() + sep;
5
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
const GITHUB_SOURCES = requireEnv('GITHUB_SOURCES').split(' ');
const AWS_BUCKET = requireEnv('AWS_BUCKET');
const AWS_ACCESS_KEY_ID = requireEnv('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = requireEnv('AWS_SECRET_ACCESS_KEY');

const octokit = new Octokit({ auth: GITHUB_ACCESS_TOKEN });
const s3 = new AWS.S3({credentials: {accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY}});

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

const listRepos = async(source) => {
    const pieces = source.split('/');
    if (pieces.length !== 4 || pieces[0] !== '' || pieces[3] !== 'repos' || (pieces[1] !== 'users' && pieces[1] !== 'orgs')) {
        throw new Error(`Invalid github repo source: ${source}`);
    }
6.
    const response = await octokit.request(`GET ${source}`);
    if (response.status !== 200) {
        throw new Error(`Error downloading repo list for ${source}`);
    }
    
    return await Promise.all(response.data.map(processRepository));
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
    // Grab all visible repositories from the provided github sources
    let allRepos = [];
    for (const source of GITHUB_SOURCES) {
        const repos = await listRepos(source);
        allRepos = allRepos.concat(repos);
    }

    // Grab all files currently in the S3 bucket and their hash metadata
    const currentFiles = new Map((await getS3Objects()).map(({filename, hash}) => [filename, hash]));

    // Filter down the repositories to only ones that need to be updated
    const staleRepos = allRepos.filter(({filename, hash}) => currentFiles.get(filename) !== hash);

    for (const repo of staleRepos) {
        const tmpDir = await fs.mkdtemp(TMP_DIR);
        const repoDir = join(tmpDir, 'repo');

        try {
            console.log('ready to try', repo.clone_url);
            const { stdout: stdout1, stderr: stderr1 } = await exec(`git clone --mirror --bare ${repo.clone_url} repo`, {cwd: tmpDir, env: { GIT_ASKPASS: '/app/.git-askpass', GITHUB_ACCESS_TOKEN }});
            const { stdout: stdout2, stderr: stderr2 } = await exec(`git bundle create ${join('..', repo.filename)} --all`, {cwd: repoDir});
            await rimraf(repoDir);
            const { stdout: stdout3, stderr: stderr3 } = await exec(`ls -alFh`, {cwd: tmpDir});

            // Upload the bundle file and the hash metadata
            await s3Upload(repo.filename, join(tmpDir, repo.filename), repo.hash);
        } finally {
            await rimraf(tmpDir);
        }
    }
      
      console.log('Done');
};

main();
