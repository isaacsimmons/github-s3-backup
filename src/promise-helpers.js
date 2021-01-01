import {promisify } from 'util';
import { exec as execCallback } from 'child_process';

import rimrafCallback from 'rimraf';
import AWS from 'aws-sdk';

import { settings } from './settings.js';

export const exec = promisify(execCallback);

export const rimraf = (filepath) => new Promise((resolve, reject) => {
    rimrafCallback(filepath, {}, (error) => {
        if (error) {
            reject(error);
        } else {
            resolve();
        }
    });
});

const s3 = new AWS.S3({credentials: {accessKeyId: settings.AWS_ACCESS_KEY_ID, secretAccessKey: settings.AWS_SECRET_ACCESS_KEY}});

export const s3Upload = (params) => 
    new Promise((resolve, reject) => {

        s3.upload(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    });

export const s3List = (params) => 
    new Promise((resolve, reject) => {
        s3.listObjectsV2(params, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      })
    });


export const s3Head = (params) => 
new Promise((resolve, reject) => {
    s3.headObject(params, (err, data) => {
        if (err) {
            reject(err);
        } else {
            resolve(data);
        }
    });
});

