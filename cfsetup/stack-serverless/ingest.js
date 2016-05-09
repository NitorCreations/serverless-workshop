var AWS = require('aws-sdk');
var RESPONSE = require('cfn-response');

var esDomain = {
    region: 'eu-west-1',
    index: 'taxdata',
    doctype: 'taxdata'
};
//var endpoint =  new AWS.Endpoint(esDomain.endpoint);
var s3 = new AWS.S3();
var docsTotal = 0;
var docsPosted = 0;

function listTaxData(bucket, prefix, context) {
  s3.listObjectsV2({Bucket: bucket, Prefix: prefix}, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      context.fail();
    } else {
      console.log(data);
      filesTotal = data.Contents.length;
      data.Contents.forEach(function(datafile) {
        if (datafile.Size > 0) {
          parseTaxDataFromS3ToES(data.Name, datafile.Key, context);
        }
      });
    }
  });
}

function parseTaxDataFromS3ToES(bucket, key, context) {
  s3.getObject({Bucket: bucket, Key: key}, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      context.fail();
    } else {
      console.log(data);
      var lines = data.Body.toString('utf8').split('\n');
      lines.splice(0, 1);
      lines.forEach(function(line) {
        var lineItems = line.split(';');
        var esDocument = {};
        ++docsTotal;
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
                esDocument.municipalityNumber = item.substring(0, 4);
                esDocument.municipalityName = item.substring(4);
              } else {
                console.log("municipality parsing fail: " + item);
              }
              break;
            case 4:
              esDocument.taxableIncome = item;
              break;
            case 5:
              esDocument.taxDue = item;
              break;
            case 6:
              esDocument.advanceTax = item;
              break;
            case 7:
              esDocument.taxRefund = item;
              break;
            case 8:
              esDocument.residualTax = item;
              break;
            default:
              console.log("unexpected line item " + index + ": " + item);
          }
        });
        postDocumentToES(esDocument, context);
      });
    }
  });
}

/*
 * The AWS credentials are picked up from the environment.
 * They belong to the IAM role assigned to the Lambda function.
 * Since the ES requests are signed using these credentials,
 * make sure to apply a policy that permits ES domain operations
 * to the role.
 */
var creds = new AWS.EnvironmentCredentials('AWS');

/*
 * Add the given document to the ES domain.
 */
function postDocumentToES(doc, context) {
    var req = new AWS.HttpRequest(endpoint);

    req.method = 'POST';
    req.path = '/' + esDomain.index + '/' + esDomain.doctype;
    req.region = esDomain.region;
    req.body = JSON.stringify(doc);
    req.headers['presigned-expires'] = false;
    req.headers['Host'] = endpoint.host;

    // Sign the request (Sigv4)
    var signer = new AWS.Signers.V4(req, 'es');
    signer.addAuthorization(creds, new Date());

    // Post document to ES
    var send = new AWS.NodeHttpClient();
    console.log("posting to ES");
    send.handleRequest(req, null, function(httpResp) {
        console.log("httpResp callback");
        var body = '';
        httpResp.on('data', function (chunk) {
            body += chunk;
        });
        httpResp.on('end', function (chunk) {
          console.log("added document to ES");
          ++docsPosted;
          if (docsTotal === docsPosted) {
            console.log("All docs posted: " + docsPosted);
            var responseData = {};
            RESPONSE.send(responseEvent, context, RESPONSE.SUCCESS, responseData);
          }
        });
    }, function(err) {
        console.log('Error: ' + err);
        context.fail();
    });
}

/* Lambda "main": Execution starts here */
exports.handler = function(event, context) {
    console.log('Received event: ', JSON.stringify(event, null, 2));
    //from cloudformation custom resource properties:
    endpoint = new AWS.Endpoint(event.ResourceProperties.ESEndpoint);
    esDomain.region = event.ResourceProperties.Region;
    responseEvent = event;
    listTaxData(event.ResourceProperties.Bucket, event.ResourceProperties.Prefix, context);
}
