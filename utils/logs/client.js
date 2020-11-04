'use strict'

const { SLS } = require('aliyun-sdk');
const Log = require('@alicloud/log');

class Client {
  constructor (credentials, region) {
    this.region = region
    this.credentials = credentials

    this.accountId = credentials.AccountID
    this.accessKeyID = credentials.AccessKeyID
    this.accessKeySecret = credentials.AccessKeySecret
    this.stsToken = credentials.SecurityToken
  }

  buildLogClient () {
    return new Log({
      region: this.region,
      accessKeyId: this.accessKeyID,
      accessKeySecret: this.accessKeySecret
    })
  }

  buildSlsClient () {
    return new SLS({
      accessKeyId: this.accessKeyID,
      secretAccessKey: this.accessKeySecret,
      endpoint: `http://${this.region}.sls.aliyuncs.com`,
      apiVersion: '2015-06-01'
    })
  }
}

module.exports = Client
