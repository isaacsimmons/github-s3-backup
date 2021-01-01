'use strict';

import { Octokit } from '@octokit/core';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import {promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { sep, join } from 'path';
import { tmpdir } from 'os';

const exec = promisify(execCallback);
const TMP_DIR = tmpdir() + sep;

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
const GITHUB_REPO_BLACKLIST = (process.env.GITHUB_REPO_BLACKLIST || '').split(' ');
// const AWS_BUCKET = requireEnv('AWS_BUCKET');
// const AWS_ACCESS_KEY_ID = requireEnv('AWS_ACCESS_KEY_ID');
// const AWS_SECRET_ACCESS_KEY = requireEnv('AWS_SECRET_ACCESS_KEY');

// List all repos from Github (belonging to the user specified by GH_USERNAME?) (what if I also want to backup some of my org repos?)

// Create a personal access token at https://github.com/settings/tokens/new?scopes=repo
const octokit = new Octokit({ auth: GITHUB_ACCESS_TOKEN });

const listRepos = async(source) => {
    const pieces = source.split('/');
    if (pieces.length !== 4 || pieces[0] !== '' || pieces[3] !== 'repos' || (pieces[1] !== 'users' && pieces[1] !== 'orgs')) {
        throw new Error(`Invalid github repo source: ${source}`);
    }

    const response = await octokit.request(`GET ${source}`);
    if (response.status !== 200) {
        throw new Error(`Error downloading repo list for ${source}`);
    }
    // TODO: honor the rate limit headers if you need to pull lots of data here
    // TODO: pagination?
    return response.data.map(({id, clone_url, full_name}) => ({id, clone_url, full_name}));
};

const getBranches = async(full_name) => {
    const response = await octokit.request(`GET /repos/${full_name}/branches`);
    if (response.status !== 200) {
        throw new Error(`Error fetching branch information for ${full_name}`);
    }
    return response.data.map(respData => ({name: respData.name, hash: respData.commit.sha}));
};

const calculateRepoHash = (branchData) => {
    if (branchData.length === 0) {
        throw new Error('No branch data found');
    }
    const shaSum = createHash('sha256');
    for (const branch of branchData) {
        shaSum.update(branch.hash);
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

    // Calculate a hash based on the hashes of every branch in the repo to see if there are any new commits
    for (const repo of allRepos) {
        const branches = await getBranches(repo.full_name);
        const hash = calculateRepoHash(branches);
        repo.hash = hash;

        const filename = repo.full_name.replaceAll('/', '_') + '.bundle';
        repo.filename = filename;
    }

    // {
    //     id: 49146647,
    //     clone_url: 'https://github.com/sharpspring/beacon.git',
    //     full_name: 'sharpspring/beacon',
    //     hash: '0c2422b861d393437f30c8620186f24c7d4599a8a4cc1ed9015c5093d802d100'
    //   },
    //   {
    //     id: 49523236,
    //     clone_url: 'https://github.com/sharpspring/strading.git',
    //     full_name: 'sharpspring/strading',
    //     hash: 'f706945f15b04014f20f9e880d96198cfbfc123f36a0e941f3467ba16b52a8de'
    //   }
    // ]


    // Grab all files currently in the S3 bucket and their hash metadata

    // Filter down the repositories to only ones that need to be updated
    // TODO: this
    const staleRepos = allRepos.slice(0, 3);

    for (const repo of staleRepos) {
        const tmpDir = await fs.mkdtemp(TMP_DIR);

        const url = new URL(repo.clone_url);
        url.username = GITHUB_USERNAME;

        console.log('ready to try', url.toString());
        const { stdout: stdout1, stderr: stderr1 } = await exec(`git clone --mirror --bare ${url.toString()} repo`, {cwd: tmpDir, env: { GIT_ASKPASS: '/app/.git-askpass', GITHUB_ACCESS_TOKEN }});
        console.log('stdout:', stdout1);
        console.log('stderr:', stderr1);
        const { stdout: stdout2, stderr: stderr2 } = await exec(`git bundle create ${join('..', repo.filename)} --all`, {cwd: join(tmpDir, 'repo')});
        console.log('stdout:', stdout2);
        console.log('stderr:', stderr2);
        const { stdout: stdout3, stderr: stderr3 } = await exec(`ls -alFh`, {cwd: tmpDir});
        console.log('stdout:', stdout3);
        console.log('stderr:', stderr3);
        // TODO: try/finally? Cleanup the temp directories
    }
      // List all files already in the bucket
      
      
      // Calculate the list of repos to backup
      
      // git clone --mirror
      // git bundle --all
      // Maybe just use the archive/zip option? (or, you know, not)
      // upload new version
      
      console.log('Done');
};

main();
