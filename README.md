# Github S3 Backup

A simple backup script to archive your Github repositories to AWS S3.
I'm a proponent of personal data ownership but honestly feel like a large number of online services are more hassle than they're worth to self-host.
Most of my personal git repositories I have either made public or plan to do so, so there aren't many privacy concerns with keeping them in "the cloud".
That being said, I don't want to rely solely on a 3rd party to safeguard my data, and I'd like to minimize vendor lock-in as much as possible.

This project is meant to automate the process of generating backups of all of a user's github repositories in a vendor-neutral (`git bundle`) format.
Those files are then uploaded to to S3 (yes yes, I know... avoiding cloud lock-in by using another cloud service).

The basic process goes something like:

1) Scan all repositories on Github
1) Pull all branches and their current sha hashes, combine them to create a repository version fingerprint
1) Scan all bundles currently in the bucket and pull the last recorded version fingerprint from the metadata
1) Calculate which repositories need to be backed up and then:
  1) Clone it into a temp directory
  1) Create a git bundle
  1) Upload the bundle
  1) Delete any tempoary files

This tool is stateless except for the configuration and the backups themselves.

# Configuration

Copy `.env.template` to `.env` and fill in all of the values.

## Github

Enter your github username.
Generate a personal access token with the "repo" scope at https://github.com/settings/tokens/new?scopes=repo and copy that value into the environment file as well.

## AWS

Create an access key for an IAM user with sufficient S3 permissions.
You can probably narrow it down more, but I just use the `AmazonS3FullAccess` policy.

Create a bucket to store the repositories in.
It should probably be private.
If object versioning is enabled, you'll probably also want some process to clear out old versions.

The access key id, access key, and bucket name all need to be placed in the environment file.

## Healthcheck.io

There is also an (optional) integration with [Healthchecks.io](https://healthchecks.io/) that might work with other monitoring systems as well.
If you add an environment value for `HEALTHCHECK_PING_URL`, it will perform a simple GET request to that URL at the end of every successful run.

# Running

## Running Locally

1) Ensure that you have the following dependencies installed:
  * Node 15
  * git
1) Complete the configuration steps above.
1) Run `yarn install` to get dependencies from npm.
1) Run `yarn backup-local` to trigger the script.

Maybe think about putting the last step in a cron if you want it to happen automatically.

## Running in Docker

1) Ensure that you have docker installed
1) Complete the configuration steps above.
1) Run `./run-in-docker.sh` to build and run the docker image.

Maybe think about putting the last step in a cron if you want it to happen automatically.
Depending on your permissions, you may need to launch `run-in-docker` with sudo or as root in order for it to be able to communicate with docker.

## Running in the Cloud

TODO: this?
Instrucitons for setting it up as an AWS Lambda Cron or something.
Probably need to build and publish the image to ECR.

# Limitations

This only works with Github currently, but could probably be extended to scrape from other git hosting providers without too much effort.
Likewise, it has only been configured to backup the files to Amazon S3, but again wouldn't be difficult to extend with additional storage backends.
Only the commits themselves are covered by this.
If you need Pull Requests, Issues, Wikis, etc backed up as well, then support for those would need to be added.

The fetching of object metadata from S3 and branch information from github are both un-batched and issue one request per repository.
In the case that you have a very large number of repositories, this may incur a signifcant network or time cost.

Repositories are only backed up if they have changed since the last time this tool was run.
However, if there are changes, the backup process isn't incremental.
For particularly large git repositories, this may introduce undeseriable performance considerations.
