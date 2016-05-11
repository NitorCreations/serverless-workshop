var AWS = require('aws-sdk');
var path = require('path');
var iconv = require('iconv-lite');

var s3 = new AWS.S3();
var CONCURRENT_POSTS_LIMIT = 5;

var exports = module.exports = {};
exports.esDomain = {
    index: 'taxdata',
    doctype: 'taxdata',
    region: 'eu-west-1'
};

/*
 * Get the log file from the given S3 bucket and key.  Parse it and add
 * each log record to the ES domain.
 */
exports.s3LinesToES = function (bucket, key, context, lineStream, recordStream, runData) {
    this.createIndexIfNotExist(context);

    var converterStream = iconv.decodeStream('iso-8859-15');
    var s3Stream = s3.getObject({Bucket: bucket, Key: key}).createReadStream();
    // Flow: S3 file stream -> Log Line stream -> Log Record stream -> ES
    s3Stream
      .pipe(converterStream)
      .pipe(lineStream)
      .pipe(recordStream)
      .on('end', function () {
        console.log("Stream end event");
        this.postDocumentToES(null, context, recordStream, runData, true);
      }.bind(this));

    recordStream.on('data', function(parsedEntry) {
        if (runData.postsInProgress >= CONCURRENT_POSTS_LIMIT) {
          recordStream.pause();
        }
        this.postDocumentToES(parsedEntry, context, recordStream, runData, false);
      }.bind(this));

    s3Stream.on('error', function() {
        console.log(
            'Error getting object "' + key + '" from bucket "' + bucket + '".  ' +
            'Make sure they exist and your bucket is in the same region as this function.');
        context.fail();
    });
};

exports.parse = function(line, runData) {
  var lineItems = line.split(';');
  var esDocument = {};
  ++runData.totLines;
  lineItems.forEach(function(item, index) {
    switch(index) {
      case 0:
        esDocument.year = parseInt(item);
        break;
      case 1:
        esDocument.businessId = item;
        break;
      case 2:
        esDocument.name = item;
        break;
      case 3:
        if (item.indexOf(' ') === 3) {
          esDocument.municipalityNumber = item.substring(0, 3);
          esDocument.municipalityName = item.substring(4);
        } else {
          console.log("municipality parsing fail: " + item);
        }
        break;
      case 4:
        esDocument.taxableIncome = numberize(item);
        break;
      case 5:
        esDocument.taxDue = numberize(item);
        break;
      case 6:
        esDocument.advanceTax = numberize(item);
        break;
      case 7:
        esDocument.taxRefund = numberize(item);
        break;
      case 8:
        esDocument.residualTax = numberize(item);
        break;
      default:
        console.log("unexpected line item " + index + ": " + item);
    }
  });
  return esDocument;
};

function numberize(value) {
  return parseFloat(value.replace(",", ".").replace("\r", "")).toFixed(2);
}

/*
 * The AWS credentials are picked up from the environment.
 * They belong to the IAM role assigned to the Lambda function.
 * Since the ES requests are signed using these credentials,
 * make sure to apply a policy that permits ES domain operations
 * to the role.
 */
var creds = new AWS.EnvironmentCredentials('AWS');

var esBulkBuffer = [];

exports.postDocumentToES = function(doc, context, stream, runData, lastDoc) {
  if (doc) {
    esBulkBuffer.push('{"index": {}}');
    esBulkBuffer.push(doc);
  }

  if (lastDoc && esBulkBuffer.length === 0) {
    return;
  }

  if (esBulkBuffer.length >= 500 || lastDoc) {

    var endpoint =  new AWS.Endpoint(this.esDomain.endpoint);
    var req = new AWS.HttpRequest(endpoint);
    var docsInPost = esBulkBuffer.length / 2;

    req.method = 'POST';
    req.path = path.join('/', this.esDomain.index, this.esDomain.doctype, '_bulk');
    req.region = this.esDomain.region;
    esBulkBuffer.forEach(function(data) {
        req.body += data + "\n";
    });
    esBulkBuffer = [];
    req.headers['presigned-expires'] = false;
    req.headers['Host'] = endpoint.host;

    // Sign the request (Sigv4)
    var signer = new AWS.Signers.V4(req, 'es');
    signer.addAuthorization(creds, new Date());

    // Post document to ES
    var send = new AWS.NodeHttpClient();
    ++runData.postsInProgress;
    send.handleRequest(req, null, function(httpResp) {
        var body = '';
        httpResp.on('data', function (chunk) {
            body += chunk;
        });
        httpResp.on('end', function (chunk) {
            runData.numDocsAdded += docsInPost;
            if (runData.numDocsAdded % 1000 === 0 || lastDoc) {
              console.log("At " + runData.numDocsAdded + " docs with "
              + context.getRemainingTimeInMillis() + " millis lambda time left...");
            }
            if (runData.numDocsAdded === runData.totLines) {
                // Mark lambda success.  If not done so, it will be retried.
                console.log('All ' + runData.numDocsAdded + ' docs added to ES.');
                context.succeed();
            }
            --runData.postsInProgress;
            if (runData.postsInProgress < CONCURRENT_POSTS_LIMIT) {
              stream.resume();
            }
        });
    }, function(err) {
        console.log('Error: ' + err);
        console.log(runData.numDocsAdded + ' of ' + runData.totLines + ' log records added to ES.');
        context.fail();
    });

  }
};

exports.createIndexIfNotExist = function(context) {
  var endpoint =  new AWS.Endpoint(this.esDomain.endpoint);
  var req = new AWS.HttpRequest(endpoint);
  req.method = 'GET';
  req.path = path.join('/', this.esDomain.index);
  req.region = this.esDomain.region;
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = endpoint.host;

  // Sign the request (Sigv4)
  var signer = new AWS.Signers.V4(req, 'es');
  signer.addAuthorization(creds, new Date());

  // Post document to ES
  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, (function(httpResp) {
      if (httpResp.statusCode != 200) {
        console.log("Index not found, creating");
        this.createIndex(context);
      }
  }.bind(this)), function(err) {
      console.log('Error checking index: ' + err);
      context.fail();
  });
};

exports.createIndex = function createIndex(context) {
  var endpoint =  new AWS.Endpoint(this.esDomain.endpoint);
  var req = new AWS.HttpRequest(endpoint);
  req.method = 'PUT';
  req.path = path.join('/', this.esDomain.index);
  req.region = this.esDomain.region;
  req.body = JSON.stringify({
    "mappings" : {
      "taxdata" : {
        "properties" : {
          "year" : { "type" : "long" },
          "businessId" : { "type" : "string" },
          "name" : {
            "type" : "string",
            "fields" : {
              "raw": {
                "type":  "string",
                "index": "not_analyzed"
              }
            }
          },
          "municipalityNumber" : { "type" : "string" },
          "municipalityName" : {
            "type" : "string",
            "fields" : {
              "raw": {
                "type":  "string",
                "index": "not_analyzed"
              }
            }
          },
          "taxableIncome" : { "type" : "double"},
          "taxDue" : { "type" : "double"},
          "advanceTax" : { "type" : "double"},
          "taxRefund" : { "type" : "double"},
          "residualTax" : { "type" : "double"}
        }
      }
    }
  });
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = endpoint.host;

  // Sign the request (Sigv4)
  var signer = new AWS.Signers.V4(req, 'es');
  signer.addAuthorization(creds, new Date());

  // Post document to ES
  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, function(httpResp) {
    console.log("create index status: " + httpResp.statusCode);
  }, function(err) {
      console.log('Error creating index: ' + err);
      context.fail();
  });
};

exports.deleteIndex = function(context) {
  var endpoint =  new AWS.Endpoint(this.esDomain.endpoint);
  var req = new AWS.HttpRequest(endpoint);
  req.method = 'DELETE';
  req.path = path.join('/', this.esDomain.index);
  req.region = this.esDomain.region;
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = endpoint.host;

  // Sign the request (Sigv4)
  var signer = new AWS.Signers.V4(req, 'es');
  signer.addAuthorization(creds, new Date());

  // Post document to ES
  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, (function(httpResp) {
    console.log("delete index status: " + httpResp.statusCode);
  }.bind(this)), function(err) {
      console.log('Error checking index: ' + err);
      context.fail();
  });
};
