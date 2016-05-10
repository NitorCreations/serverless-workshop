var AWS = require('aws-sdk');
var path = require('path');

var s3 = new AWS.S3();
var totLines = 0;
var numDocsAdded = 0;
var postsInProgress = 0;
var CONCURRENT_POSTS_LIMIT = 1000;

var exports = module.exports = {};
exports.esDomain = {
    //endpoint: 'search-testmikadomain-o4bu6vt2gg6n6v3sahz4esuia4.eu-west-1.es.amazonaws.com',
    index: 'taxdata',
    doctype: 'taxdata',
    region: 'eu-west-1'
};

/*
 * Get the log file from the given S3 bucket and key.  Parse it and add
 * each log record to the ES domain.
 */
exports.s3LinesToES = function (bucket, key, context, lineStream, recordStream) {
    var s3Stream = s3.getObject({Bucket: bucket, Key: key}).createReadStream();

    // Flow: S3 file stream -> Log Line stream -> Log Record stream -> ES
    s3Stream
      .pipe(lineStream)
      .pipe(recordStream)
      .on('data', function(parsedEntry) {
        ++postsInProgress;
        if (postsInProgress >= CONCURRENT_POSTS_LIMIT) {
          s3Stream.pause();
        }
        this.postDocumentToES(parsedEntry, context, s3Stream);
      }.bind(this));

    s3Stream.on('error', function() {
        console.log(
            'Error getting object "' + key + '" from bucket "' + bucket + '".  ' +
            'Make sure they exist and your bucket is in the same region as this function.');
        context.fail();
    });
};

exports.parse = function(line) {
  var lineItems = line.split(';');
  var esDocument = {};
  ++totLines;
  lineItems.forEach(function(item, index) {
    switch(index) {
      case 0:
        esDocument.year = item;
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
        esDocument.taxableIncome = parseFloat(item.replace(",", "."));
        break;
      case 5:
        esDocument.taxDue = parseFloat(item.replace(",", "."));
        break;
      case 6:
        esDocument.advanceTax = parseFloat(item.replace(",", "."));
        break;
      case 7:
        esDocument.taxRefund = parseFloat(item.replace(",", "."));
        break;
      case 8:
        esDocument.residualTax = parseFloat(item.replace("\r", "").replace(",", "."));
        break;
      default:
        console.log("unexpected line item " + index + ": " + item);
    }
  });
  return esDocument;
};
/*
 * The AWS credentials are picked up from the environment.
 * They belong to the IAM role assigned to the Lambda function.
 * Since the ES requests are signed using these credentials,
 * make sure to apply a policy that permits ES domain operations
 * to the role.
 */
var creds = new AWS.EnvironmentCredentials('AWS');

exports.postDocumentToES = function(doc, context, s3Stream) {
  var endpoint =  new AWS.Endpoint(this.esDomain.endpoint);
  var req = new AWS.HttpRequest(endpoint);

  req.method = 'POST';
  req.path = path.join('/', this.esDomain.index, this.esDomain.doctype);
  req.region = this.esDomain.region;
  req.body = doc;
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = endpoint.host;

  // Sign the request (Sigv4)
  var signer = new AWS.Signers.V4(req, 'es');
  signer.addAuthorization(creds, new Date());

  // Post document to ES
  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, function(httpResp) {
      var body = '';
      httpResp.on('data', function (chunk) {
          body += chunk;
      });
      httpResp.on('end', function (chunk) {
          numDocsAdded ++;
          if (numDocsAdded % 1000 === 0) {
            console.log("At " + numDocsAdded + " docs with "
            + context.getRemainingTimeInMillis() + " millis lambda time left...");
          }
          if (numDocsAdded === totLines) {
              // Mark lambda success.  If not done so, it will be retried.
              console.log('All ' + numDocsAdded + ' docs added to ES.');
              context.succeed();
          }
          --postsInProgress;
          if (postsInProgress < CONCURRENT_POSTS_LIMIT) {
            s3Stream.resume();
          }
      });
  }, function(err) {
      console.log('Error: ' + err);
      console.log(numDocsAdded + ' of ' + totLines + ' log records added to ES.');
      context.fail();
  });
};
