'use strict'

const FC = require('@alicloud/fc2');

const { SLS } = require('aliyun-sdk');

class Client {
  constructor (credentials, region) {
    this.region = region
    this.credentials = credentials

    this.accountId = credentials.AccountID
    this.accessKeyID = credentials.AccessKeyID
    this.accessKeySecret = credentials.AccessKeySecret
    this.stsToken = credentials.SecurityToken
  }

  buildFcClient () {
    return new FC(this.accountId, {
      accessKeyID: this.accessKeyID,
      accessKeySecret: this.accessKeySecret,
      securityToken: this.stsToken,
      region: this.region,
      timeout: 6000000
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
