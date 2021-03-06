'use strict';

var lib = require('../lib');
var LineStream = require('byline').LineStream;
var stream = require('stream');
var ServerlessHelpers = require('serverless-helpers-js');
ServerlessHelpers.loadEnv();

module.exports.handler = function(event, context, cb) {
  console.log('Received event: ', JSON.stringify(event, null, 2));
  process.env["SERVERLESS_REGION"] = process.env.AWS_DEFAULT_REGION;
  process.env["SERVERLESS_PROJECT_NAME"] = "slss-workshop";
  ServerlessHelpers.CF.loadVars()
  .then(function() {
    lib.esDomain['endpoint'] = process.env.SERVERLESS_CF_ESDomainEndpoint;
    lib.deleteIndex(context);
  })
  .catch(function(err) {
    return context.done(err, null);
  });

};
